/**
 * Runs before first paint (inlined in <head>) so a stored light/dark choice
 * applies without a flash of the other theme. Kept apart from the toggle
 * because that is a Client Component, whose exports the server cannot read.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
