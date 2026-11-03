const { createStore } = require("./sqlite");

function openStore(event) {
  return createStore(event);
}

module.exports = { openStore };
