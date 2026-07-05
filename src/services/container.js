const { getDb } = require("../db/client");
const { AppRepository } = require("../repositories/appRepository");
const { AppService } = require("./appService");
const { AuthService } = require("./authService");

function services() {
  const repository = new AppRepository(getDb());
  return {
    app: new AppService(repository),
    auth: new AuthService(repository),
  };
}

module.exports = { services };
