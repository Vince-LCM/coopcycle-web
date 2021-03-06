require('dotenv').config()

var serialize = require('locutus/php/var/serialize');
var pg = require('pg');
var fs = require('fs');
var net = require('net');
var DatabaseCleaner = require('database-cleaner');
var jwt = require('jsonwebtoken');
var Sequelize = require('sequelize');
var _ = require('lodash');
var pgCleaner = new DatabaseCleaner('postgresql', {
  postgresql: {
    skipTables: [],
    strategy: 'truncation'
  }
});
var redisCleaner = new DatabaseCleaner('redis');

function TestUtils() {

  let port = 5432
  if (process.env.COOPCYCLE_DB_PORT) {
    port = parseInt(process.env.COOPCYCLE_DB_PORT, 10)
  }

  this.pgConfig = {
    user: process.env.COOPCYCLE_DB_USER,
    database: process.env.COOPCYCLE_DB_NAME + '_test',
    password: process.env.COOPCYCLE_DB_PASSWORD || null,
    host: process.env.COOPCYCLE_DB_HOST,
  };

  this.redis = require('redis').createClient({
    prefix: process.env.COOPCYCLE_DB_NAME + '_test:',
    url: process.env.COOPCYCLE_REDIS_DSN
  });

  this.tile38 = require('redis').createClient({
    url: process.env.COOPCYCLE_TILE38_DSN
  });

  var privateKey = fs.readFileSync(__dirname + '/../../var/jwt/private.pem');

  this.cert = {
    key: privateKey,
    passphrase: process.env.COOPCYCLE_PRIVATE_KEY_PASSPHRASE
  };

  var sequelize = new Sequelize(
    process.env.COOPCYCLE_DB_NAME + '_test',
    process.env.COOPCYCLE_DB_USER,
    process.env.COOPCYCLE_DB_PASSWORD || null,
    {
      host: process.env.COOPCYCLE_DB_HOST,
      port: port,
      dialect: 'postgres',
      logging: false,
    }
  );

  this.db = require('../api/Db')(sequelize);
}

TestUtils.prototype.createJWT = function(username) {
  return jwt.sign({ username: username }, this.cert, { algorithm: 'RS256' });
};

TestUtils.prototype.cleanDb = function() {
  var pgConfig = this.pgConfig;
  var redis = this.redis;
  var tile38 = this.tile38;

  var pool = new pg.Pool(pgConfig);

  return new Promise(function(resolve, reject) {
    pool.connect(function(err, client, done) {

      if (err) return reject(err);

      var cleanRedis = new Promise(function(resolve, reject) {
        redisCleaner.clean(redis, function(err) {
          if (err) return reject(err);
          return resolve();
        });
      });

      var cleanPg = new Promise(function(resolve, reject) {
        pgCleaner.clean(client, function(err) {
          if (err) return reject(err);
          pool.end();
          return resolve();
        });
      });

      var cleanTile38 = new Promise(function(resolve, reject) {
        const tile38FleetKey = `${process.env.COOPCYCLE_DB_NAME}_test:fleet`
        tile38.send_command('DROP', [tile38FleetKey], function(err) {
          if (!err) {
            resolve()
          } else {
            reject()
          }
        })
      });

      return Promise.all([ cleanPg, cleanRedis, cleanTile38 ])
        .then(() => resolve())
        .catch(err => reject(err))
    });
  });
};

TestUtils.prototype.createUser = function(username, roles) {

  const { User } = this.db

  var params = {
    'username': username,
    'username_canonical': username,
    'email': username + '@coopcycle.dev',
    'email_canonical': username + '@coopcycle.dev',
    'roles': serialize(roles),
    'password': '123456',
    'enabled': true
  }

  return new Promise(function (resolve, reject) {
    User.create(params)
      .then(function(user) {
        resolve(user)
      })
      .catch(function(e) {
        reject(e.errors)
      })
  })
};

TestUtils.prototype.createTaxCategory = function(name, code) {

  const { TaxCategory } = this.db

  return new Promise(function (resolve, reject) {

    TaxCategory
      .findOne({ where: { code } })
      .then(function(taxCategory) {

        if (taxCategory !== null) {
          return resolve(taxCategory)
        }

        return TaxCategory.create({
          name,
          code,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .then(function(taxCategory) {
          resolve(taxCategory)
        })
        .catch(function(e) {
          reject(e)
        })
      })
  })
};

TestUtils.prototype.createDeliveryAddress = function(username, streetAddress, geo) {

  var Address = this.db.Address;
  var User = this.db.User;

  return new Promise(function (resolve, reject) {
    User.findOne({ where: { username: username } })
      .then((customer) => {
        Address.create({
          postalCode: '991',
          addressLocality: 'Paris big city of the dream',
          streetAddress: streetAddress,
          geo: { type: 'Point', coordinates: [ geo.lat, geo.lng ]}
        })
        .then(function(address) {
          customer.addAddress(address).then(resolve);
        })
        .catch(function(err) {
          reject(err.errors)
        });
      });
  });
};

TestUtils.prototype.createRestaurant = function(name, coordinates) {
  var Restaurant = this.db.Restaurant;
  var Address = this.db.Address;

  return new Promise(function (resolve, reject) {

    Address.create({
      postalCode: '991',
      streetAddress: 'testStreet',
      addressLocality: 'Paris big city of the dream',
      geo: { type: 'Point', coordinates: [ coordinates.latitude, coordinates.longitude ] }
    }).then(function(address) {
      Restaurant.create({
        type: 'restaurant',
        name: name,
        openingHoursBehavior: 'asap',
        createdAt: new Date(),
        updatedAt: new Date(),
      }).then(function(restaurant) {
        restaurant.setAddress(address).then(function() {
          resolve(restaurant);
        })
      })
    })

  });
};

TestUtils.prototype.createRandomOrder = function(username, restaurant, taxCategoryCode) {

  var Restaurant = this.db.Restaurant;
  var Order = this.db.Order;
  var User = this.db.User;
  var Delivery = this.db.Delivery;
  var TaxCategory = this.db.TaxCategory;
  var TaskCollection = this.db.TaskCollection;

  var redis = this.redis;

  return new Promise(function (resolve, reject) {

    Promise.all([
      User.findOne({ where: { username: username } }),
      TaxCategory.findOne({ where: { code: taxCategoryCode } }),
      restaurant.getAddress()
    ]).then(objects => {

      const [customer, taxCategory, restaurantAddress] = objects

      customer.getAddresses()
        .then(deliveryAddresses => _.first(deliveryAddresses))
        .then(function(deliveryAddress) {

          let order = Order.build({
            uuid: 'some-random-string',
            createdAt: new Date(),
            updatedAt: new Date(),
            readyAt: new Date(),
            totalExcludingTax: 0.00,
            totalTax: 0.00,
            totalIncludingTax: 0.00
          });
          order.setCustomer(customer, { save: false });
          order.setRestaurant(restaurant, { save: false });

          return order.save().then(function(order) {
            return TaskCollection.create({
              type: 'delivery'
            })
            .then(function(taskCollection) {
              let delivery = Delivery.build({
                id: taskCollection.id,
                date: new Date(),
                distance: 1000,
                duration: 600,
                polyline: '',
                price: 3.5,
                totalExcludingTax: 0.00,
                totalTax: 0.00,
                totalIncludingTax: 0.00,
              })
              delivery.setTaxCategory(taxCategory, { save: false });
              delivery.setOriginAddress(restaurantAddress, { save: false });
              delivery.setDeliveryAddress(deliveryAddress, { save: false });
              delivery.setOrder(order, { save: false });

              return delivery.save();
            })
            .then(function(delivery) {
              return { order, delivery };
            })
          })
        })
        .then(function(args) {
          const { order, delivery } = args;
          redis.lpush('deliveries:waiting', delivery.id, function(err) {
            if (err) return reject(err);
            resolve(order);
          });
        })
        .catch(function(e) {
          reject(e);
        });

    })

  });

};

TestUtils.prototype.updateLocation = function(username, latitude, longitude) {
  const tile38FleetKey = `${process.env.COOPCYCLE_DB_NAME}_test:fleet`

  return new Promise((resolve, reject) => {
    this.tile38.send_command('SET', [tile38FleetKey, username,
      'POINT', latitude, longitude], function(err, res) {
      if (!err) {
        resolve()
      }
    })
  });
};

let timeoutId;

TestUtils.prototype.waitServerUp = function (host, port, timeout) {
  /*
    Wait for the connection to be open at the specified host/port
    - host : server host
    - port : server port
    - timeout : timeout (in milliseconds)
  */

  var timeout = timeout || 50000,
      client;

  function cleanUp() {
    if (client) {
      client.removeAllListeners('connect');
      client.removeAllListeners('error');
      client.end();
      client.destroy();
      client.unref();
    }
  }

  return new Promise(function (resolve, reject) {

    timeoutId = setTimeout(function () {
      reject('Unable to connect to server');
    }, timeout);

    function onConnectCb () {
      // console.log('Server is up!');
      clearTimeout(timeoutId);
      cleanUp();
      resolve();
    }

    function onErrorCb (err) {
      if (err.code === 'ECONNREFUSED') {
        // console.log('Unable to connect retrying..');
        setTimeout(doCheck, 200);
      } else {
        cleanUp();
        reject(err);
      }
    }

    function doCheck() {
      client = new net.Socket();
      client.once('connect', onConnectCb);
      client.once('error', onErrorCb);
      client.connect({port: port, host: host});
    }

    doCheck();
  });
};

module.exports = TestUtils;
