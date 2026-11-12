/* Runs first (before the page paints): applies day/night theme and the 18+ gate. */
(function () {
  var root = document.documentElement;
  root.dataset.theme = localStorage.getItem("ih_theme") || "dark";
  var me = document.currentScript;
  if (me && me.dataset.age === "1" && sessionStorage.getItem("ih_age_ok") !== "1") {
    root.classList.add("age-locked");
  }
})();
