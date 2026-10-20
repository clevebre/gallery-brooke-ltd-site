/** Pure catalogue rules. No DOM, network, filesystem or provider side effects. */
export function filterWorks(works, {kind='all', qualities=[], query='', collection='all'}={}) {
  const needle=String(query).trim().toLocaleLowerCase();
  return works.filter(work =>
    (kind==='all'||work.kind===kind) &&
    (collection==='all'||work.collectionId===collection) &&
    qualities.every(quality=>(work.qualities||[]).includes(quality)) &&
    (!needle||[work.title,work.description,work.kind,...(work.qualities||[])].join(' ').toLocaleLowerCase().includes(needle))
  );
}

export function relatedWorks(works, workId, limit=3) {
  const current=works.find(work=>work.id===workId);
  if(!current) return [];
  return works.filter(work=>work.id!==workId)
    .map((work,index)=>({work,index,score:(work.collectionId===current.collectionId?100:0)+(work.qualities||[]).filter(q=>(current.qualities||[]).includes(q)).length}))
    .sort((a,b)=>b.score-a.score||a.index-b.index)
    .slice(0,Math.max(0,limit)).map(item=>item.work);
}

export function nextWorkId(works, currentId, direction=1) {
  if(!works.length) return null;
  const index=works.findIndex(work=>work.id===currentId);
  if(index<0) return works[0].id;
  const step=direction<0?-1:1;
  return works[(index+step+works.length)%works.length].id;
}

export function checkoutFor(product, {mode='review'}={}) {
  if(mode!=='production'||!product||product.releaseStatus!=='active'||
     product.rightsVerified!==true||product.checkoutVerified!==true||
     product.price?.status!=='approved') return null;
  try {
    const url=new URL(product.checkoutUrl);
    if(url.protocol!=='https:'||url.hostname!=='buy.polar.sh'||url.username||url.password||url.port||
       !/^\/polar_cl_[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

const safeImage=path => typeof path==='string' &&
  /^assets\/art\/[a-z0-9-]+\.(webp|avif|png|jpg)$/.test(path);
const safeId=id=>typeof id==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);

export function validateCatalogue(catalogue, {mode='review'}={}) {
  const errors=[];
  if(catalogue?.schemaVersion!==1) errors.push('SCHEMA_VERSION: expected 1');
  if(!Array.isArray(catalogue?.works)||!Array.isArray(catalogue?.collections)||
     !Array.isArray(catalogue?.kinds)||!Array.isArray(catalogue?.qualities)||
     !Array.isArray(catalogue?.products)) return [...errors,'SCHEMA_ARRAYS: required catalogue lists missing'];
  const kinds=new Set(catalogue.kinds.map(item=>item.id));
  const qualities=new Set(catalogue.qualities.map(item=>item.id));
  const collections=new Set();
  const collectionById=new Map();
  for(const collection of catalogue.collections) {
    if(collections.has(collection.id)) errors.push(`DUPLICATE_COLLECTION: ${collection.id}`);
    collections.add(collection.id);
    collectionById.set(collection.id,collection);
  }
  const workById=new Map(catalogue.works.map(work=>[work.id,work]));
  const productById=new Map(catalogue.products.map(product=>[product.id,product]));
  const workIds=new Set();
  for(const work of catalogue.works) {
    if(!safeId(work.id)) errors.push(`INVALID_WORK_ID: ${work.id}`);
    if(workIds.has(work.id)) errors.push(`DUPLICATE_WORK: ${work.id}`);
    workIds.add(work.id);
    if(!kinds.has(work.kind)) errors.push(`UNKNOWN_KIND: ${work.id}`);
    if(!collections.has(work.collectionId)) errors.push(`UNKNOWN_COLLECTION: ${work.id}`);
    if(!Array.isArray(work.qualities)||work.qualities.some(q=>!qualities.has(q))) errors.push(`UNKNOWN_QUALITY: ${work.id}`);
    if(!work.title?.trim()||!work.alt?.trim()) errors.push(`MISSING_CAPTION: ${work.id}`);
    if(!safeImage(work.image?.src)||!safeImage(work.image?.thumbnail)) errors.push(`UNSAFE_IMAGE: ${work.id}`);
    if(!Number.isInteger(work.image?.width)||!Number.isInteger(work.image?.height)||
       work.image.width<1||work.image.height<1||work.image.width>1600||work.image.height>1600) errors.push(`INVALID_DIMENSIONS: ${work.id}`);
    if(mode==='production'&&work.publicationApproved!==true) errors.push(`PUBLICATION_UNAPPROVED: ${work.id}`);
  }
  for(const collection of catalogue.collections) {
    const members=Array.isArray(collection.workIds)?collection.workIds:[];
    if(!safeId(collection.id)) errors.push(`INVALID_COLLECTION: ${collection.id}`);
    if(!Array.isArray(collection.workIds)||!members.length||new Set(members).size!==members.length||
       members.some(id=>!workIds.has(id))) errors.push(`INVALID_COLLECTION_MEMBERS: ${collection.id}`);
    if(!workIds.has(collection.heroId)||!members.includes(collection.heroId)) errors.push(`INVALID_COLLECTION_HERO: ${collection.id}`);
    for(const id of members) {
      if(workById.has(id)&&workById.get(id).collectionId!==collection.id) errors.push(`COLLECTION_WORK_MISMATCH: ${collection.id}: ${id}`);
    }
    for(const work of catalogue.works) {
      if(work.collectionId===collection.id&&!members.includes(work.id)) errors.push(`UNLISTED_COLLECTION_WORK: ${collection.id}: ${work.id}`);
    }
    if(collection.productId!=null) {
      const product=productById.get(collection.productId);
      if(!product) errors.push(`UNKNOWN_COLLECTION_PRODUCT: ${collection.id}`);
      else if(product.collectionId!==collection.id) errors.push(`COLLECTION_PRODUCT_MISMATCH: ${collection.id}`);
    }
  }
  const products=new Set();
  for(const product of catalogue.products) {
    if(!safeId(product.id)||products.has(product.id)) errors.push(`INVALID_PRODUCT: ${product.id}`);
    products.add(product.id);
    const collection=collectionById.get(product.collectionId);
    if(!collection||!Array.isArray(collection.workIds)||!Array.isArray(product.workIds)||!product.workIds.length||
       new Set(product.workIds).size!==product.workIds.length||product.workIds.some(id=>
         !workIds.has(id)||!collection.workIds.includes(id)||workById.get(id)?.collectionId!==product.collectionId)) errors.push(`INVALID_PRODUCT_WORKS: ${product.id}`);
    if(!Number.isInteger(product.price?.amount)||product.price.amount<0||! /^[A-Z]{3}$/.test(product.price?.currency||'')) errors.push(`INVALID_PRICE: ${product.id}`);
    if(product.checkoutUrl&& !checkoutFor({...product,releaseStatus:'active',rightsVerified:true,checkoutVerified:true,price:{...product.price,status:'approved'}},{mode:'production'})) errors.push(`UNSAFE_CHECKOUT: ${product.id}`);
    if(mode==='production'&&product.releaseStatus==='active'&&!checkoutFor(product,{mode})) errors.push(`COMMERCE_UNVERIFIED: ${product.id}`);
  }
  if(mode==='production'&&catalogue.site?.publicTextApproved!==true) errors.push('COPY_UNAPPROVED: outward words require Brooke review');
  if(/(?:^|[\s"'])[A-Z]:[\\/]|drive\.google\.com|oaiusercontent\.com|source_drive_id|download_url|api[_-]?key/i.test(JSON.stringify(catalogue))) errors.push('PRIVATE_DATA: source or credential reference in public catalogue');
  return errors;
}
