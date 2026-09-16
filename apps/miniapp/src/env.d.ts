declare const __API_BASE_URL__: string;
declare module '*.css';
declare module '*.png' {
  const path: string;
  export default path;
}
declare module '*.jpg' {
  const path: string;
  export default path;
}
