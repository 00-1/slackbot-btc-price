
const extend = require('extend');

const MessageHandler = require(__base +'models/MessageHandlers/MessageHandler.js');
const BtcPrice = require(__base +'models/BtcPrice.js');


class CryptoMessageHandler extends MessageHandler {

	async determineResponse() {
		var words = this.text.replace("  "," ").split(" ");

		// Check for btc conversion phrase "btc to usd"
		if (words.length > 2 && words[0].toLowerCase() == 'btc' && words[1].toLowerCase() == 'to') {
			return this.response_btcConversion({
				from: words[0],
				to: words[2],
			});
		}

		// Check for chart phrase "chart btc to usd"
		if (words.length > 3 && words[0].toLowerCase() == 'chart' && words[1].toLowerCase() == 'btc' && words[2].toLowerCase() == 'to') {
			return this.response_btcChart({
				from: words[1],
				to: words[3],
			});
		}

		return false;
	}

	async response_btcConversion(_opt) {
		var opt = {
			from: 'btc',
			to: 'usd',
		};
		opt = extend({}, opt, _opt);

		var btcPrice = new BtcPrice();

		try {
			var currentPrice = await btcPrice.getCurrent({
				crypto	: opt.from,
				fiat	: opt.to,
			});
		} catch (error) {
			return error;
		}

		//currentPrice = (currentPrice.replace(',','')-0).toFixed(2);
		currentPrice = this.numberWithCommas(currentPrice.toFixed(2));

		var from_str = opt.from.toUpperCase();
		var to_str = opt.to.toUpperCase();
		var to_symbol = this.symbolForCurrency(opt.to);

		return `*1* (${from_str}) is *${to_symbol}${currentPrice}* (${to_str})`;
	}

	async response_btcChart(_opt) {
		var opt = {
			from	: 'btc',
			to		: 'usd',
			days	: 7,	// how many days to fetch
			offset	: 0,	// how many days ago
		};
		opt = extend({}, opt, _opt);

		var btcPrice = new BtcPrice();

		var endDate = new Date();
		endDate.setDate(endDate.getDate() - opt.offset - 1);	// 1 extra day for difference comparision

		var startDate = new Date(endDate.getTime());
		startDate.setDate(startDate.getDate() - opt.days);

		try {
			var historicalPrices = await btcPrice.getHistorical({
				startDate	: startDate,
				endDate		: endDate,
				crypto		: opt.from,
				fiat		: opt.to,
			});
			var currentPricePromise = btcPrice.getCurrent({
				crypto		: opt.from,
				fiat		: opt.to,
			});
		} catch (error) {
			return error;
		}

		// Ensure order is correct by converting to an array and sorting.
		// Collect min/max at the same time.
		var price_min = 0;
		var price_max = 0;

		var historicalPrices_array = [];
		for (const date in historicalPrices) {
			const price = historicalPrices[date];
			historicalPrices_array.push({
				type: 'normal',
				date: date,
				price: price,
			});

			// Set min/max
			if (!price_min) {
				price_min = price;
				price_max = price;
			}
			else if (price < price_min) {
				price_min = price;
			}
			else if (price > price_max) {
				price_max = price;
			}
		}

		historicalPrices_array.sort(function(a, b) {
			if (a.date < b.date) { return -1; }
			if (a.date > b.date) { return 1; }
			return 0;
		});

		var currentPrice = await currentPricePromise;
		var date = btcPrice.dateToDateString(new Date());
		//console.log('currentPrice', currentPrice);
		historicalPrices_array.push({
			type: 'today',
			date: date,
			price: currentPrice,
		});

		// Produce response

		/*
		min: 100
		max: 124

		delta: 24
		steps: 12

		112 = 6

		112 - 100 = 12
		12 / 24 = 0.5
		0.5 * 12 = 6

		max - val = x
		x / delta = y
		y * steps = z
		*/

		var price_delta = price_max - price_min;
		var acsii_chart_steps = 30;

		var response = 'The last eight days:\r\n`';

		for (let i = 1; i < historicalPrices_array.length; i++) {
			const dataPoint = historicalPrices_array[i];
			const date = dataPoint.date;
			const price = dataPoint.price;

			var lastPrice = historicalPrices_array[i-1].price;
			var diff = dataPoint.price - lastPrice;

			// Determine acsii chart 'step/indent'
			var step = ((price - price_min) / price_delta) * acsii_chart_steps;

			historicalPrices_array[i].step = step;

			var price_symbol = this.symbolForCurrency(opt.to);
			var price_str = price.toFixed(2);

			var step_str = '';
			for (let i = 0; i < step; i++) {
				step_str += ' ';
			}

			var change_symbol = (diff >= 0) ? ':christmas_tree:' : ':small_red_triangle_down:';
			// var change_symbol = (diff >= 0) ? ':arrow_lower_right:' : ':arrow_lower_left:';
			// var change_symbol = (diff >= 0) ? ':christmas_tree:' : ':fire:';
			// var change_symbol = (diff >= 0) ? ':chart_with_downwards_trend:' : ':chart_with_upwards_trend:';
			if (diff == 0) { change_symbol = ':zzz:'; }

			response += `\`${date} : ${price_symbol}${price_str}\`  ${step_str}${change_symbol}\r\n`;
			
                        if (dataPoint.type == 'today') {
				continue;
                        }
		}
		
		//console.log(historicalPrices_array);

		return response;

	}

	numberWithCommas(x) {
		return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}

	symbolForCurrency(currency) {

		currency = currency.toLowerCase();

		if (currency == 'usd') { return '$'; }
		if (currency == 'gbp') { return '£'; }
		if (currency == 'eur') { return '€'; }
		
		return '';

	}

}

module.exports = CryptoMessageHandler;
