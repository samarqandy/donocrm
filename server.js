const { port } = require("./src/config/app");
const { createServer } = require("./src/http/server");

createServer().listen(port, "0.0.0.0", () => {
  console.log(`Dono running at http://0.0.0.0:${port}`);
});
