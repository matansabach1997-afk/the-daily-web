const weatherService = require("../services/weatherService");

async function getWeather(req, res, next) {
  try {
    const city = req.query.city;
    const weather = await weatherService.getWeather(city);

    res.json({
      weather,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getWeather,
};