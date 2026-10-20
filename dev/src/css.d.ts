// CSS imported as text (shadow-root widget styles); see build.mjs loader.
declare module '*.css' {
  const text: string;
  export default text;
}
