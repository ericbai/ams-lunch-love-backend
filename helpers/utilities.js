'use strict';

module.exports.isDefined = function(val) {
	return val !== null && val !== undefined;
}

module.exports.isNumber = function(num) {
	return !isNaN(parseInt(num));
}

module.exports.toNumber = function(num) {
	const parsedNum = parseInt(num);
	return !isNaN(parsedNum) ? parsedNum : null;
}