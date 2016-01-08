/* 
    TERMS OF USE
    Open source under the MIT License.
    Copyright 2016 Matthijs Logemann All rights reserved.
*/
module.exports = init;

var superagent = require('superagent');
var Service = null;
var Characteristic = null;

function init(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory('homebridge-thinkingcleaner', 'Roomba', ThinkingCleaner);
}

function ThinkingCleaner(log, config) {
	this.log = log;
	var that = this;
	
	this.name = config.name;
	this.ip_address = config.ip_address;

	this.informationService = new Service.AccessoryInformation();
	this.informationService.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Thinking Bits")
			.setCharacteristic(Characteristic.Model, "Thinking Cleaner")
			.setCharacteristic(Characteristic.SerialNumber, "Unknown.")
			.setCharacteristic(Characteristic.FirmwareRevision, "Unknown");
	
	if (!this.ip_address) {
		locateTC.call(this, function(err, cleaner) {
			if (err) throw err;

			// TODO: Find a way to persist this
			that.ip_address = cleaner.local_ip;
			that.cleaner = cleaner;
			that.log("Save the Thinking Cleaner ip address " + cleaner.local_ip + " to your config to skip discovery.");
			getSWVersion.call(that);
		});
	}else {
		getSWVersion.call(this);	
	}
}

var getSWVersion = function() {
		var that = this;
//		that.informationService.setCharacteristic(Characteristic.SerialNumber, "Loading!");

		superagent.get("http://"+that.ip_address+"/full_status.json").timeout(60000).end(function(error, response) {
			if (error) {
				that.log("Could not load full_status: %s", error.message);
//				that.informationService.setCharacteristic(Characteristic.SerialNumber, "Unknown!");
			} else {
				var tcObj = JSON.parse(response.text);
				that.log(tcObj.firmware.version);
//				that.informationService.setCharacteristic(Characteristic.SerialNumber, "Loaded!");
			}
		});
	}

	
var locateTC = function(callback) {
	var that = this;

	// Report the results of the scan to the user
	var getIp = function(err, cleaners) {
		if (!cleaners || cleaners.length === 0) {
			that.log("No Thinking Cleaner devices found.");
			callback(err || new Error("No Thinking Cleaner found"));
			return;
		}

		if (cleaners.length > 1) {
			that.log("Warning: Multiple Thinking Cleaner devices detected. The first Thinking Cleaner will be used automatically. To use a different Thinking Cleaner, set the `ip_address` manually in the configuration.");
		}

		that.log("Thinking Cleaners found:" + (cleaners.map(function(cleaner) {
			// Bridge name is only returned from meethue.com so use id instead if it isn't there
			return " " + cleaner.local_ip + ' - ' + cleaner.name;
		})).join(" "));

		callback(null, cleaners[0]);
	};

	superagent.get("http://tc.thinkingsync.com/api/v1/discover/devices").timeout(60000).end(function(error, response) {
		if (error) {
			this.log("Could not find Thinking Cleaners: %s", error.message);
			getIp(new Error(error));
		} else {
			that.log("Scan complete");

			var tcArr = response.body;

			getIp(null, tcArr);
		}
	});
};

ThinkingCleaner.prototype = {
	setPowerState: function(powerOn, callback) {
		var url;

		if (powerOn) {
			url = this.ip_address + "/command.json?command=clean";
			this.log(this.name + ": Start cleaning");
		} else {
			url = this.ip_address + "/command.json?command=dock";
			this.log(this.name + ": Start docking");
		}

		superagent.get(url).end(function(error, response) {
			if (error) {
				this.log("Could not send command to Thinking Cleaner: %s", error.message);
				callback(error);
			} else {
				callback();
			}
		});

	},

	getPowerState: function(callback) {
		var url = this.ip_address + "/status.json";

		superagent.get(url).end(function(error, response) {
			if (error) {
				callback(error);
			} else {
				var tcObj = JSON.parse(response.text);

				callback(null, tcObj.status.cleaning);
			}
		});
	},

	identify: function(callback) {
		this.log("Identify requested!");
		superagent.get(this.ip_address + "/command.json?command=find_me").end(function(error, response) {
			if (error) {
				this.log("Could not send command to Thinking Cleaner: %s", error.message);
				callback(error);
			} else {
				callback();
			}
		});
	},

	getServices: function() {
		// the default values for things like serial number, model, etc.
var that = this;
		var switchService = new Service.Switch(this.name);

		switchService.getCharacteristic(Characteristic.On).on('set', this.setPowerState.bind(this));
		switchService.getCharacteristic(Characteristic.On).on('get', this.getPowerState.bind(this));
//setTimeout(function () {
//	that.log("Hey");
//		that.informationService.setCharacteristic(Characteristic.SerialNumber, "Hi there!");
//}, 10)

		return [this.informationService, switchService];
	}
};
