export class AppError extends Error { constructor(status,code,message,fields){super(message);this.status=status;this.code=code;this.fields=fields;} }
export function notFound(_req,res){res.status(404).json({error:{code:'NOT_FOUND',message:'Not found'}});}
export function errorHandler(error,_req,res,_next){
  const status=error.status||(error.name==='CastError'?404:error.code===11000?409:500);
  const code=error.code===11000?'DUPLICATE_RESOURCE':error.name==='CastError'?'NOT_FOUND':error.code||'INTERNAL_ERROR';
  const message=status===500?'Something went wrong. Please try again.':error.name==='CastError'?'Not found.':error.code===11000?'This resource already exists.':error.message;
  res.status(status).json({error:{code,message,...(error.fields?{fields:error.fields}:{})}});
}
