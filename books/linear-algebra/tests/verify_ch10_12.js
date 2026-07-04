// Верификация глав 10–12 + эталонная мини-библиотека капстоуна (Г12.Ч4.З1–З6)
let fails = 0;
const eq = (name, got, want, eps = 1e-6) => {
  const g = [].concat(got), w = [].concat(want);
  const ok = g.length === w.length && g.every((x, i) => Math.abs(x - w[i]) <= eps);
  if (!ok) { console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); fails++; }
};

// ===== Мини-библиотека: vec3 (Г12.Ч4.З1) =====
const add=(a,b)=>a.map((x,i)=>x+b[i]), sub=(a,b)=>a.map((x,i)=>x-b[i]), scale=(a,k)=>a.map(x=>x*k);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0), length=a=>Math.sqrt(dot(a,a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const mix=(a,b,t)=>add(scale(a,1-t),scale(b,t));
const EPS=1e-12;
const normalize=a=>{const L=length(a); if(L<EPS) throw new Error('normalize(0)'); return scale(a,1/L);};

// ===== Мини-библиотека: mat4, column-major как GLSL (Г12.Ч4.З2–З4) =====
// m[c*4+r]: столбец c, строка r
const m4ident=()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function m4mul(A,B){ // C = A·B
  const C=new Array(16).fill(0);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++){let s=0; for(let k=0;k<4;k++) s+=A[k*4+r]*B[c*4+k]; C[c*4+r]=s;}
  return C;
}
const m4xv=(M,v)=>[0,1,2,3].map(r=>M[r]*v[0]+M[4+r]*v[1]+M[8+r]*v[2]+M[12+r]*v[3]);
const m4transformPoint=(M,p)=>m4xv(M,[...p,1]).slice(0,3);
const m4transformDir=(M,v)=>m4xv(M,[...v,0]).slice(0,3);
const m4transpose=M=>{const T=new Array(16); for(let c=0;c<4;c++)for(let r=0;r<4;r++)T[r*4+c]=M[c*4+r]; return T;};
const m4translate=t=>[1,0,0,0, 0,1,0,0, 0,0,1,0, t[0],t[1],t[2],1];
const m4scale=s=>[s[0],0,0,0, 0,s[1],0,0, 0,0,s[2],0, 0,0,0,1];
const m4rotX=a=>{const c=Math.cos(a),s=Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];};
const m4rotY=a=>{const c=Math.cos(a),s=Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];};
const m4rotZ=a=>{const c=Math.cos(a),s=Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1];};
function m4lookAt(eye,target,up){ // Г12.Ч4.З4 (гл. 8, § 8.2.2)
  let f=normalize(sub(target,eye));
  if(Math.abs(dot(f,normalize(up)))>0.999) up=Math.abs(f[1])>0.999?[0,0,1]:[0,1,0];
  const r=normalize(cross(f,up)); const u=cross(r,f);
  return [r[0],u[0],-f[0],0, r[1],u[1],-f[1],0, r[2],u[2],-f[2],0, -dot(r,eye),-dot(u,eye),dot(f,eye),1];
}
function m4perspective(fovy,aspect,n,f){ // гл. 9, § 9.2.3
  const c=1/Math.tan(fovy/2);
  return [c/aspect,0,0,0, 0,c,0,0, 0,0,-(f+n)/(f-n),-1, 0,0,-2*f*n/(f-n),0];
}

// ===== Мини-библиотека: quat = [w,x,y,z] (Г12.Ч4.З5) =====
const qFromAxisAngle=(axis,a)=>{const n=normalize(axis),s=Math.sin(a/2); return [Math.cos(a/2),n[0]*s,n[1]*s,n[2]*s];};
function qMul(q1,q2){ // (w1,v1)(w2,v2) = (w1w2 − v1·v2, w1v2 + w2v1 + v1×v2)
  const [w1,...v1]=q1,[w2,...v2]=q2;
  const w=w1*w2-dot(v1,v2);
  const v=add(add(scale(v2,w1),scale(v1,w2)),cross(v1,v2));
  return [w,...v];
}
const qConj=q=>[q[0],-q[1],-q[2],-q[3]];
const qNorm=q=>Math.sqrt(q.reduce((s,x)=>s+x*x,0));
const qNormalize=q=>{const L=qNorm(q); return q.map(x=>x/L);};
const qRotate=(q,v)=>qMul(qMul(q,[0,...v]),qConj(q)).slice(1); // v′ = q·(0,v)·q*
function qToMat4(q){const [w,x,y,z]=q;
  return [1-2*(y*y+z*z),2*(x*y+w*z),2*(x*z-w*y),0,
          2*(x*y-w*z),1-2*(x*x+z*z),2*(y*z+w*x),0,
          2*(x*z+w*y),2*(y*z-w*x),1-2*(x*x+y*y),0, 0,0,0,1];} // column-major
function qNlerp(q1,q2,t){ // с поправкой знака (double cover)
  if(q1.reduce((s,x,i)=>s+x*q2[i],0)<0) q2=q2.map(x=>-x);
  return qNormalize(q1.map((x,i)=>x*(1-t)+q2[i]*t));
}

const D=Math.PI/180;

// ===== Глава 10, часть 1 =====
// Г10.Ч1.З2: R_y(90)R_x(90)(1,0,0) vs R_x(90)R_y(90)(1,0,0)
eq('Г10.Ч1.З2', [
  ...m4transformDir(m4mul(m4rotY(90*D),m4rotX(90*D)),[1,0,0]),
  ...m4transformDir(m4mul(m4rotX(90*D),m4rotY(90*D)),[1,0,0])], [0,0,-1, 0,1,0], 1e-12);
// Г10.Ч1.З3: R_x(90): z→−y, y→z
eq('Г10.Ч1.З3', [...m4transformDir(m4rotX(90*D),[0,0,1]), ...m4transformDir(m4rotX(90*D),[0,1,0])], [0,-1,0, 0,0,1], 1e-12);
// Г10.Ч1.З4: M(α,90°,β) зависит только от α−β: сравним (10°,90°,0°) и (30°,90°,20°)
eq('Г10.Ч1.З4', (()=>{
  const M=(a,b)=>m4mul(m4rotY(a),m4mul(m4rotX(90*D),m4rotZ(b)));
  const A=M(10*D,0), B=M(30*D,20*D); return A.map((x,i)=>x-B[i]);})(), new Array(16).fill(0), 1e-9);
// Г10.Ч1.З7: (0,90,0) ≡ (10,90,10)
eq('Г10.Ч1.З7', (()=>{
  const M=(a,b)=>m4mul(m4rotY(a),m4mul(m4rotX(90*D),m4rotZ(b)));
  const A=M(0,0), B=M(10*D,10*D); return A.map((x,i)=>x-B[i]);})(), new Array(16).fill(0), 1e-9);

// ===== Глава 10, часть 2: Родриг =====
const rodrigues=(v,n,a)=>add(add(scale(v,Math.cos(a)),scale(cross(n,v),Math.sin(a))),scale(n,dot(n,v)*(1-Math.cos(a))));
eq('Г10.Ч2.З1', [...rodrigues([0,0,1],[0,1,0],90*D), ...rodrigues([0,0,1],[0,1,0],180*D)], [1,0,0, 0,0,-1], 1e-12);
eq('Г10.Ч2.З2', [...rodrigues([1,1,0],[0,0,1],90*D), ...m4transformDir(m4rotZ(90*D),[1,1,0])], [-1,1,0, -1,1,0], 1e-12);
eq('Г10.Ч2.З3', rodrigues([1,0,0],normalize([1,1,1]),120*D), [0,1,0], 1e-12);
// Г10.Ч2.З5: M = перестановка x→y→z→x: ось (1,1,1), поворот 120°
eq('Г10.Ч2.З5', (()=>{const Mv=v=>[v[2],v[0],v[1]]; // M·v для M=[[0,0,1],[1,0,0],[0,1,0]]
  return [...Mv([1,1,1]), ...Mv([1,0,0])];})(), [1,1,1, 0,1,0]);
// Г10.Ч2.З6: Родриг с n=(0,1,0) воспроизводит R_y(θ) на осях (θ=37°)
eq('Г10.Ч2.З6', (()=>{const a=37*D;
  return [...rodrigues([1,0,0],[0,1,0],a), ...m4transformDir(m4rotY(a),[1,0,0])];})(),
  (()=>{const a=37*D; const e=[Math.cos(a),0,-Math.sin(a)]; return [...e,...e];})(), 1e-12);

// ===== Глава 10, часть 3: кватернионы =====
eq('Г10.Ч3.З1 единичность', [qNorm(qFromAxisAngle([0,1,0],180*D)), qNorm(qFromAxisAngle([1,0,0],90*D)), qNorm(qFromAxisAngle([1,1,1],120*D))], [1,1,1], 1e-12);
eq('Г10.Ч3.З1 значения', [...qFromAxisAngle([1,1,1],120*D)], [0.5,0.5,0.5,0.5], 1e-12);
eq('Г10.Ч3.З2', [...qMul([0,1,0,0],[0,0,1,0]), ...qMul([0,0,1,0],[0,1,0,0])], [0,0,0,1, 0,0,0,-1]);
eq('Г10.Ч3.З3', qRotate(qFromAxisAngle([0,1,0],90*D),[0,0,1]), [1,0,0], 1e-12);
eq('Г10.Ч3.З3 пример 4', qRotate(qFromAxisAngle([0,1,0],90*D),[1,0,0]), [0,0,-1], 1e-12);
eq('Г10.Ч3.З4', qMul(qFromAxisAngle([0,1,0],90*D), qConj(qFromAxisAngle([0,1,0],90*D))), [1,0,0,0], 1e-12);
eq('Г10.Ч3.З5', (()=>{const q=[Math.SQRT1_2,0,Math.SQRT1_2,0];
  const R1=qToMat4(q), R2=qToMat4(q.map(x=>-x)), Ry=m4rotY(90*D);
  return [...R1.map((x,i)=>x-Ry[i]), ...R2.map((x,i)=>x-Ry[i])];})(), new Array(32).fill(0), 1e-9);
eq('Г10.Ч3.З6', (()=>{const qa=qFromAxisAngle([0,1,0],90*D), qb=qFromAxisAngle([1,0,0],90*D);
  const q=qMul(qb,qa); return [...q, ...qRotate(q,[1,0,0])];})(), [0.5,0.5,0.5,0.5, 0,1,0], 1e-9);
eq('Г10.Ч3.З7', qNorm(qMul(qNormalize([1,2,3,4]), qNormalize([4,3,2,1]))), 1, 1e-12);
eq('Г10.Ч3.З8', 2*Math.acos(0.5)/D, 120, 1e-9); // (0.5,0.5,0.5,0.5): угол 120°, не 90°
eq('Г10.Ч3.З9 композиция 4×90°', (()=>{const q=qFromAxisAngle([0,1,0],90*D);
  const q4=qMul(q,qMul(q,qMul(q,q))); return qRotate(q4,[0.3,0.7,-0.2]);})(), [0.3,0.7,-0.2], 1e-9);

// ===== Глава 10, часть 4: интерполяция =====
eq('Г10.Ч4.З1', (()=>{const l=[0.5,0,0.5,0]; return [qNorm(l), ...qNormalize(l)];})(), [Math.SQRT1_2, Math.SQRT1_2,0,Math.SQRT1_2,0], 1e-12);
function slerp(q1,q2,t){
  let d=q1.reduce((s,x,i)=>s+x*q2[i],0);
  if(d<0){q2=q2.map(x=>-x); d=-d;}
  if(d>0.9995) return qNormalize(q1.map((x,i)=>x*(1-t)+q2[i]*t));
  const O=Math.acos(d);
  return q1.map((x,i)=>(Math.sin((1-t)*O)*x+Math.sin(t*O)*q2[i])/Math.sin(O));
}
eq('Г10.Ч4.З2 slerp=пример 5', slerp([1,0,0,0],[Math.SQRT1_2,0,Math.SQRT1_2,0],0.5), [Math.cos(22.5*D),0,Math.sin(22.5*D),0], 1e-9);
eq('Г10.Ч4.З2 nlerp(0.5)=slerp(0.5)', (()=>{const a=[1,0,0,0],b=[Math.SQRT1_2,0,Math.SQRT1_2,0];
  const n=qNlerp(a,b,0.5), s=slerp(a,b,0.5); return n.map((x,i)=>x-s[i]);})(), [0,0,0,0], 1e-9);
eq('Г10.Ч4.З3 double cover', (()=>{const q2=[-Math.SQRT1_2,0,-Math.SQRT1_2,0];
  const R1=qToMat4(q2), R2=m4rotY(90*D); return R1.map((x,i)=>x-R2[i]);})(), new Array(16).fill(0), 1e-9);
eq('Г10.Ч4.З6 nlerp 170°→85°', (()=>{const q=qNlerp([1,0,0,0], qFromAxisAngle([0,1,0],170*D), 0.5);
  return 2*Math.acos(q[0])/D;})(), 85, 1e-6);

// ===== Глава 11 =====
const mv2=(M,v)=>[M[0][0]*v[0]+M[0][1]*v[1], M[1][0]*v[0]+M[1][1]*v[1]];
const mm2=(A,B)=>[[A[0][0]*B[0][0]+A[0][1]*B[1][0], A[0][0]*B[0][1]+A[0][1]*B[1][1]],[A[1][0]*B[0][0]+A[1][1]*B[1][0], A[1][0]*B[0][1]+A[1][1]*B[1][1]]];
eq('Г11.Ч1.З1', mv2([[1,2],[2,1]],[1,-1]), [-1,1]); // λ=−1
eq('Г11.Ч1.З2', [...mv2([[5,4],[1,2]],[4,1]), ...mv2([[5,4],[1,2]],[1,-1])], [24,6, 1,-1]); // λ=6 и λ=1
eq('Г11.Ч1.З7 ось', (()=>{const M=[[0,-1,0],[1,0,0],[0,0,1]]; const v=[0,0,1];
  return [M[0][2]*v[2], M[1][2]*v[2], M[2][2]*v[2]];})(), [0,0,1]); // M·(0,0,1)=(0,0,1)
eq('Г11.Ч2.З1 PDP⁻¹=A', (()=>{const P=[[1,1],[-1,1]], D_=[[2,0],[0,4]], Pinv=[[0.5,-0.5],[0.5,0.5]];
  return mm2(mm2(P,D_),Pinv).flat();})(), [3,1,1,3]);
eq('Г11.Ч2.З2 A³', (()=>{const A=[[3,1],[1,3]]; return mm2(mm2(A,A),A).flat();})(), [36,28,28,36]);
eq('Г11.Ч2.З2 через PD³P⁻¹', (()=>{const P=[[1,1],[-1,1]], D3=[[8,0],[0,64]], Pinv=[[0.5,-0.5],[0.5,0.5]];
  return mm2(mm2(P,D3),Pinv).flat();})(), [36,28,28,36]);
eq('Г11.Ч2.З4', [...mv2([[5,3],[3,5]],[1,-1]), ...mv2([[5,3],[3,5]],[1,1]), dot([1,-1],[1,1])], [2,-2, 8,8, 0]); // λ=2, λ=8, ортогональны
eq('Г11.Ч2.З6', [Math.pow(1.01,100), Math.pow(0.98,100)], [2.7048, 0.1326], 1e-3);

// ===== Глава 12 =====
const reflect=(I,N)=>sub(I,scale(N,2*dot(N,I)));
eq('Г12.Ч1.З4', reflect(scale([1,-1,0],Math.SQRT1_2),[0,1,0]), [Math.SQRT1_2,Math.SQRT1_2,0], 1e-12);
eq('Г12.Ч1.З5', mix([1,0,0],[0,0,1],0.25), [0.75,0,0.25]);
eq('Г12.Ч3.З1', [[0,1,0],normalize([3,4,0]),[1,0,0],[0,-1,0]].map(L=>Math.max(dot([0,1,0],L),0)), [1,0.8,0,0]);
eq('Г12.Ч3.З2', (()=>{const d=length(sub([2,3,5],[2,0,1])); return [d, 1/(1+0.09*d+0.032*d*d)];})(), [5, 1/2.25], 1e-9);
eq('Г12.Ч3.З3', (()=>{const N=[0,1,0], L=normalize([-1,1,0]), V=normalize([1,1,0]);
  const R=reflect(scale(L,-1),N); const H=normalize(add(L,V));
  return [dot(R,V), dot(N,H)];})(), [1,1], 1e-12);
eq('Г12.Ч3.З4', [Math.pow(0.95,2), Math.pow(0.95,200)], [0.9025, 3.51e-5], 1e-4);
eq('Г12.Ч3.З5', [dot(normalize([0.3,-0.95,0]),[0,-1,0]), dot(normalize([0.7,-0.7,0]),[0,-1,0])], [0.95358267, 0.70710678], 1e-6);
eq('Г12.Ч3.З9 toon', [0.2,0.5,0.9].map(d=>0.2+0.4*(d>=0.33?1:0)+0.4*(d>=0.66?1:0)), [0.2,0.6,1.0]);

// ===== Капстоун Г12.Ч4.З1–З6: тесты из условий =====
eq('З1 cross', cross([2,3,4],[5,6,7]), [-3,6,-3]);
eq('З1 normalize', normalize([3,4,0]), [0.6,0.8,0]);
eq('З1 Лагранж', dot(cross([2,3,4],[5,6,7]),cross([2,3,4],[5,6,7]))+dot([2,3,4],[5,6,7])**2, dot([2,3,4],[2,3,4])*dot([5,6,7],[5,6,7]));
eq('З2 некоммутативность', (()=>{const A=m4rotZ(90*D), B=m4scale([2,1,1]);
  const AB=m4mul(A,B), BA=m4mul(B,A); return Math.abs(AB.reduce((s,x,i)=>s+Math.abs(x-BA[i]),0))>0.5?1:0;})(), 1);
eq('З2 (AB)ᵀ=BᵀAᵀ', (()=>{const A=m4rotX(30*D), B=m4translate([1,2,3]);
  const L=m4transpose(m4mul(A,B)), R=m4mul(m4transpose(B),m4transpose(A));
  return L.map((x,i)=>x-R[i]);})(), new Array(16).fill(0), 1e-12);
eq('З3 TRS', m4transformPoint(m4mul(m4translate([5,0,0]),m4mul(m4rotZ(90*D),m4scale([2,2,2]))),[1,0,0]), [5,2,0], 1e-12);
eq('З3 RTS (орбита)', m4transformPoint(m4mul(m4rotZ(90*D),m4mul(m4translate([5,0,0]),m4scale([2,2,2]))),[1,0,0]), [0,7,0], 1e-12);
eq('З3 pivot', m4transformPoint(m4mul(m4translate([3,0,0]),m4mul(m4rotY(180*D),m4translate([-3,0,0]))),[4,0,0]), [2,0,0], 1e-12);
eq('З4 lookAt', (()=>{const V=m4lookAt([0,0,5],[0,0,0],[0,1,0]);
  return [...m4transformPoint(V,[0,0,5]), ...m4transformPoint(V,[0,0,0])];})(), [0,0,0, 0,0,-5], 1e-12);
eq('З4 lookAt защита up', (()=>{const V=m4lookAt([0,0,0],[0,5,0],[0,1,0]); // f ∥ up — не должно упасть
  return m4transformPoint(V,[0,5,0]);})(), [0,0,-5], 1e-9);
eq('З4 perspective near/far', (()=>{const P=m4perspective(90*D,1,1,10);
  const a=m4xv(P,[0,0,-1,1]), b=m4xv(P,[0,0,-10,1]);
  return [a[2]/a[3], b[2]/b[3]];})(), [-1,1], 1e-12);
eq('З5 quat тесты', (()=>{const q=qFromAxisAngle([0,1,0],90*D);
  const q4=qMul(q,qMul(q,qMul(q,q)));
  const n=qNlerp([1,0,0,0], qFromAxisAngle([0,1,0],170*D), 0.5);
  return [...qRotate(q,[1,0,0]), ...qRotate(q4,[1,2,3]), 2*Math.acos(n[0])/D];})(), [0,0,-1, 1,2,3, 85], 1e-9);
eq('З6 сквозной тест пайплайна', (()=>{
  const M=m4translate([0,0,-2]);
  const V=m4lookAt([0,0,5],[0,0,0],[0,1,0]);
  const P=m4perspective(90*D,1,1,10);
  const clip=m4xv(P, m4xv(V, m4xv(M,[1,1,0,1])));
  const ndc=[clip[0]/clip[3], clip[1]/clip[3], clip[2]/clip[3]];
  return [(ndc[0]+1)/2*800, (ndc[1]+1)/2*600, (ndc[2]+1)/2];})(), [457.142857, 342.857142, 0.952381], 1e-5);
// qToMat4 согласован с mat4-поворотами (для сцены З7)
eq('З7 quat→mat4', (()=>{const R1=qToMat4(qFromAxisAngle([0,1,0],37*D)), R2=m4rotY(37*D);
  return R1.map((x,i)=>x-R2[i]);})(), new Array(16).fill(0), 1e-12);

console.log(fails === 0 ? 'ALL CHECKS PASSED (главы 10–12 + капстоун)' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
