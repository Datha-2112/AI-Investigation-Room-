import express from 'express';import helmet from 'helmet';import cors from 'cors';import cookieParser from 'cookie-parser';import {rateLimit} from 'express-rate-limit';import pino from 'pino';import pinoHttp from 'pino-http';import path from 'node:path';import mongoose from 'mongoose';import {env} from './config/env.js';import {connectDatabase} from './config/db.js';import {requireAuth} from './middleware/auth.js';import {errorHandler,notFound} from './middleware/errors.js';import authRoutes from './routes/auth.js';import caseRoutes from './routes/cases.js';import attemptRoutes from './routes/attempts.js';import Case from './models/Case.js';import User from './models/User.js';
const app=express();const logger=pino();app.use(pinoHttp({logger}));app.use(helmet());app.use(cors({origin:env.CLIENT_ORIGIN,credentials:true}));app.use(express.json({limit:'32kb'}));app.use(cookieParser());app.use('/uploads',express.static(path.resolve(env.UPLOAD_DIR),{maxAge:'1d'}));app.get('/api/health',(_req,res)=>res.json({ok:true}));app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:30}),authRoutes);app.use('/api',requireAuth);app.use('/api/cases',rateLimit({windowMs:60*60*1000,limit:15}),caseRoutes);app.use('/api/attempts',attemptRoutes);
app.delete('/api/account',async(req,res)=>{const ids=(await Case.find({owner:req.user.id}).select('_id')).map(c=>c._id);const Attempt=(await import('./models/Attempt.js')).default;const Evidence=(await import('./models/Evidence.js')).default;await Promise.all([Attempt.deleteMany({user:req.user.id}),Evidence.deleteMany({case:{$in:ids}}),Case.deleteMany({owner:req.user.id}),User.deleteOne({_id:req.user.id})]);res.clearCookie('session');res.json({ok:true});});
app.use(notFound);app.use(errorHandler);
async function startServer(){
  try{
    await connectDatabase();
    const stuck=await Case.find({status:'generating',updatedAt:{$lt:new Date(Date.now()-10*60*1000)}});
    for(const c of stuck){c.status='failed';c.stage='done';c.error='Generation was interrupted. Your case credit has been returned.';await c.save();await User.updateOne({_id:c.owner},{$inc:{casesCreatedToday:-1}});}
    app.listen(env.PORT,()=>logger.info({port:env.PORT},'Mystery Room API listening'));
  }catch(error){
    logger.error({name:error.name,code:error.code,causeCode:error.cause?.code},'MongoDB connection failed. Start MongoDB locally or set MONGODB_URI in server/.env to a reachable database.');
    await mongoose.disconnect().catch(()=>{});
    if(process.env.NODE_ENV!=='production'){
      logger.warn({retryInMs:5000},'Will retry the MongoDB connection automatically.');
      setTimeout(startServer,5000);
      return;
    }
    process.exitCode=1;
  }
}
startServer();
