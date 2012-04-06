/*
 * DCPU-16 Emulation
 * By Matt Bell (mappum)
 */

var dcpu = {};

(function(){
	dcpu.ramSize = 0x10000; //ram size in words
	dcpu.wordSize = 2; //word size in bytes
	dcpu.maxValue = Math.pow(2, dcpu.wordSize * 8) - 1; //max value of words
	dcpu.speed = 100000; //speed in hz
	dcpu.screenOffset = 0x8000;
	dcpu.screenLength = 32 * 12;

	dcpu._stop = false;

	dcpu.basicOpcodeCost = [
			 1, 2, 2,
		2, 3, 3, 2,
		2, 1, 1, 1,
		2, 2, 2, 2
	];

	dcpu.nonBasicOpcodeCost = [
		0, 2
	];

	//RUNTIME FUNCTIONS

	// Returns the memory address at which the value resides.
	dcpu.get = function(value) {
		switch(value) {
			case 0x00: return 'a';
			case 0x01: return 'b';
			case 0x02: return 'c';
			case 0x03: return 'x';
			case 0x04: return 'y';
			case 0x05: return 'z';
			case 0x06: return 'i';
			case 0x07: return 'j';

			case 0x08: return dcpu.mem.a;
			case 0x09: return dcpu.mem.b;
			case 0x0a: return dcpu.mem.c;
			case 0x0b: return dcpu.mem.x;
			case 0x0c: return dcpu.mem.y;
			case 0x0d: return dcpu.mem.z;
			case 0x0e: return dcpu.mem.i;
			case 0x0f: return dcpu.mem.j;

			case 0x10: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc++] + dcpu.mem.a;
			case 0x11: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc++] + dcpu.mem.b;
			case 0x12: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc++] + dcpu.mem.c;
			case 0x13: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc++] + dcpu.mem.x;
			case 0x14: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc++] + dcpu.mem.y;
			case 0x15: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc++] + dcpu.mem.z;
			case 0x16: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc++] + dcpu.mem.i;
			case 0x17: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc++] + dcpu.mem.j;

			case 0x18: if(dcpu.mem.stack <= 0xffff) return ++dcpu.mem.stack;
					   else return dcpu.mem.stack;
			case 0x19: return dcpu.mem.stack;
			case 0x1a: if(dcpu.mem.stack > 0) return dcpu.mem.stack--;

			case 0x1b: return 'stack';
			case 0x1c: return 'pc';
			case 0x1d: return 'o';

			case 0x1e: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc++];
			case 0x1f: dcpu.cycle++; return dcpu.mem.pc++;

			default: return value - 0x20;
		}
	};

	// Assigns 'value' into the memory location referenced by 'key'
	dcpu.set = function(key, value) {
		// Ensure the value is within range
		value %= dcpu.maxValue;
		if (value < 0) {
			value = dcpu.maxValue + value;
		}

		//console.log('Setting dcpu.mem[' + key + '] to ' + value);
		dcpu.mem[key] = value;

		// Write to the screen if the memory-mapped device was modified
		if (key >= dcpu.screenOffset &&
				key <= dcpu.screenOffset + dcpu.screenLength)
			dcpu.print();
	};

	// Gets the instruction length for a given word.
	// TODO: Fix for non-basic opcodes, which have a different format.
	dcpu.getLength = function(word) {
		var opcode = word & 0xF;
		var a = (word >> 4) & 0x3F;
		var b = (word >> 10) & 0x3F;

		var length = 1;
		if ((a >= 0x10 && a <= 0x17) || a === 0x1e || a === 0x1f) length++;
		if ((b >= 0x10 && b <= 0x17) || b === 0x1e || b === 0x1f) length++;
		return length;
	};

	dcpu.isLiteral = function(value) {
		return (value >= 0x20 && value <= 0x3f);
	};

	dcpu.step = function() {
		// Fetch the instruction
		var word = dcpu.mem[dcpu.mem.pc++];
		var opcode = word & 0xF;
		var a = (word >> 4) & 0x3F
		var b = (word >> 10) & 0x3F;

		console.log(dcpu.formatWord(opcode), '|', dcpu.formatWord(a), dcpu.formatWord(b));

		if (opcode === 0) {
		// Non-basic
			opcode = a;
			a = b;
			var aRaw = dcpu.get(a);
			var aVal = dcpu.isLiteral(a) ? aRaw : dcpu.mem[aRaw];

			switch(opcode) {
				// JSR
				case 0x01:
					dcpu.mem[dcpu.mem.stack--] = dcpu.mem.pc;
					dcpu.mem.pc = aVal;
					break;

				// BRK (non-standard)
				case 0x02:
					dcpu.stop();
					break;

				// GET (non-standard)
				case 0x03:
					var result;
					if(!dcpu._inputBuffer) {
						result = 0;
					} else {
						result = dcpu._inputBuffer.charCodeAt(0);
						dcpu._inputBuffer = dcpu._inputBuffer.substr(1);
					}

					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, result);
					}
					break;
			}

			dcpu.cycle += dcpu.nonBasicOpcodeCost[opcode];
		} else {
		// Basic
			var aRaw = dcpu.get(a);
			var aVal = dcpu.isLiteral(a) ? aRaw : dcpu.mem[aRaw];
			var bVal = dcpu.isLiteral(b) ? dcpu.get(b) : dcpu.mem[dcpu.get(b)];

			switch(opcode) {
				// SET
				case 0x1:
					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, bVal);
					}
					break;

				// ADD
				case 0x2:
					var result = aVal + bVal;
					dcpu.mem.o = (result > dcpu.maxValue) ? 0x0001 : 0x0000;

					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, result);
					}
					break;

				// SUB
				case 0x3:
					var result = aVal - bVal;
					dcpu.mem.o = (result < 0) ? dcpu.maxValue : 0x0000;

					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, result);
					}
					break;

				// MUL
				case 0x4:
					var result = aVal * bVal;
					dcpu.mem.o = (result >> 16) & dcpu.maxValue;

					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, result);
					}
					break;

				// DIV
				case 0x5:
					var result;
					if (bVal === 0) {
						result = 0x0000;
						dcpu.mem.o = 0x0000;
					} else {
						result = Math.floor(aVal / bVal);
						dcpu.mem.o = ((aVal << 16) / bVal) & dcpu.maxValue;
					}

					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, result);
					}
					break;

				// MOD
				case 0x6:
					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, (bVal === 0) ? 0x0000 : aVal % bVal);
					}
					break;

				// SHL
				case 0x7:
					dcpu.mem.o = ((aVal << bVal) >> 16) & dcpu.maxValue;
					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, aVal << bVal);
					}
					break;

				// SHR
				case 0x8:
					dcpu.mem.o = ((aVal << 16) >> bVal) & dcpu.maxValue;
					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, aVal >> bVal);
					}
					break;

				// AND
				case 0x9:
					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, aVal & bVal);
					}
					break;

				// BOR
				case 0xa:
					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, aVal | bVal);
					}
					break;

				// XOR
				case 0xb:
					if (!dcpu.isLiteral(a)) {
						dcpu.set(aRaw, aVal ^ bVal);
					}
					break;

				// IFE
				case 0xc:
					if (aVal !== bVal) {
						dcpu.mem.pc += dcpu.getLength(dcpu.mem[dcpu.mem.pc + 1]);
						dcpu.cycle += 1;
					}
					break;

				// IFN
				case 0xd:
					if(aVal === bVal) {
						dcpu.mem.pc += dcpu.getLength(dcpu.mem[dcpu.mem.pc + 1]);
						dcpu.cycle += 1;
					}
					break;

				// IFG
				case 0xe:
					if(aVal <= bVal) {
						dcpu.mem.pc += dcpu.getLength(dcpu.mem[dcpu.mem.pc + 1]);
						dcpu.cycle += 1;
					}
					break;

				// IFB
				case 0xf:
					if(aVal & bVal == 0) {
						dcpu.mem.pc += dcpu.getLength(dcpu.mem[dcpu.mem.pc + 1]);
						dcpu.cycle += 1;
					}
					break;

				default:
					throw new Error('Encountered invalid opcode 0x' + opcode.toString(16));
			}

			dcpu.cycle += dcpu.basicOpcodeCost[opcode];
		}
	};
	dcpu.run = function(onLoop) {
		dcpu.running = true;
		function loop() {
			if(!dcpu._stop) {
				dcpu.step();
				if(onLoop) onLoop();
				setTimeout(loop, 0);
			} else {
				dcpu._stop = false;
			}
		};
		loop();
	};
	dcpu.stop = function() {
		dcpu._stop = true;
		dcpu.running = false;
	};
	dcpu.clear = function() {
		dcpu.mem = [];
		dcpu.mem.a = 0;
		dcpu.mem.b = 0;
		dcpu.mem.c = 0;
		dcpu.mem.x = 0;
		dcpu.mem.y = 0;
		dcpu.mem.z = 0;
		dcpu.mem.i = 0;
		dcpu.mem.j = 0;
		dcpu.mem.pc = 0;
		dcpu.mem.stack = 0xffff;
		dcpu.mem.o = 0;
		for(var i = 0; i < dcpu.ramSize; i++) dcpu.mem[i] = 0;

		dcpu.cycle = 0;

		dcpu._inputBuffer = '';

		dcpu.running = false;

		console.log('RAM CLEARED');
	};
	dcpu.input = function(data) {
		dcpu._inputBuffer += data;
	};
	dcpu.output = function(callback) {
		dcpu._outputListeners.push(callback);
	};
	dcpu.print = function() {
		var screen = [],
			string = '';
		for(var i = 0; i < dcpu.screenLength; i++) {
			var word = dcpu.mem[i + dcpu.screenOffset];
			screen.push([word >> 8, word & 0xff]);

			if(word & 0xff)	string += String.fromCharCode(word & 0xff);
			else string += ' ';
		}

		for(var i in dcpu._outputListeners) dcpu._outputListeners[i](screen, string);
	};
	dcpu._outputListeners = [];


	//COMPILATION FUNCTIONS
	dcpu.clean = function(code) {
		var subroutines = {},
			lineNumber = 1,
			instruction = 0,
			address = 0,
			output = '';

		code += '\n';
		while(code.length > 0) {
			var line = code.substr(0, code.indexOf('\n'));
			if(code.indexOf('\n') === -1) break;
			else code = code.substr(code.indexOf('\n') + 1);

			var op = '', a = '', b = '';

			for(var i = 0; i < line.length; i++) {
				var c = line.charAt(i);
				if(!dcpu.isWhitespace(c)) {
					if(c === ';') {
						break;
					} else if(c === ':') {
						output += dcpu.getToken(line.substr(i)) + ' ';
						i += dcpu.getToken(line.substr(i)).length;
					} else {
						if(!op) {
							op = dcpu.getToken(line.substr(i));
							i += op.length;
						} else if(!a) {
							a = dcpu.getToken(line.substr(i));

							if(a.charAt(a.length - 1) == ',') {
								a = a.substr(0, a.length - 1);
								i++;
							}

							i += a.length;
						} else if(!b) {
							b = dcpu.getToken(line.substr(i));
							i += b.length;
							break;
						}
					}
				}
			}

			if(op) {
				output += op + ' ' + a + ' ' + b + '\n';
			}
		}
		return output + '\n';
	};
	dcpu.compile = function(code) {
		var instruction = 0,
			address = 0,
			output = '',
			subroutineQueue = [],
			subroutines = {};

		while(code.length > 0) {
			var line = code.substr(0, code.indexOf('\n'));
			if(code.indexOf('\n') === -1) break;
			else code = code.substr(code.indexOf('\n') + 1);

			var op = '', a = '', b = '';

			for(var i = 0; i < line.length; i++) {
				var c = line.charAt(i);
				if(c === ':') {
					subroutines[dcpu.getToken(line.substr(i+1))] = address;
					i += dcpu.getToken(line.substr(i)).length;
				} else if(op.length === 0) {
					op = dcpu.getToken(line.substr(i));
					i += op.length;
				} else if(a.length === 0) {
					a = dcpu.getToken(line.substr(i));

					if(a.charAt(a.length - 1) == ',') {
						a = a.substr(0, a.length - 1);
						i++;
					}

					i += a.length;
				} else if(b.length === 0) {
					b = dcpu.getToken(line.substr(i));
					i += b.length;
					break;
				} else {
					throw new Error('Unexpected token (instruction ' + instruction + ')');
				}
			}

			if(op) {
				op = op.toUpperCase();
				if(dcpu.opcodes[op]) {
					function pack(value) {
						words[0] += value << (4 + operand * 6);
					};
					function parse(arg) {
						var pointer = false;
						if(arg.charAt(0) == '[' && arg.charAt(arg.length - 1) == ']') {
							pointer = true;
							arg = arg.substring(1, arg.length - 1);
						}

						//next word + register
						if(arg.split('+').length === 2
						&& (parseInt(arg.split('+')[0]) || parseInt(arg.split('+')[0] === 0))
						&& typeof arg.split('+')[1] === 'string'
						&& typeof dcpu.mem[arg.split('+')[1].toLowerCase()] === 'number') {

							switch(arg.split('+')[1].toLowerCase()) {
								case 'a': pack(0x10); break;
								case 'b': pack(0x11); break;
								case 'c': pack(0x12); break;
								case 'x': pack(0x13); break;
								case 'y': pack(0x14); break;
								case 'z': pack(0x15); break;
								case 'i': pack(0x16); break;
								case 'j': pack(0x17); break;
							}
							words.push(parseInt(arg.split('+')[0]));

						//literals/pointers, subroutines that are declared already
						} else if(parseInt(arg) || parseInt(arg) === 0) {
							var value = parseInt(arg);

							//0x20-0x3f: literal value 0x00-0x1f (literal)
							if(value <= 0x1f) {
								pack(value + 0x20);
							} else {
								//0x1e: [next word]
								if(pointer) pack(0x1e);

								//0x1f: next word (literal)
								else pack(0x1f);

								words.push(value);
							}

						//other tokens
						} else {
							switch(arg.toLowerCase()) {
								//0x00-0x07: register (A, B, C, X, Y, Z, I or J, in that order)
								//0x08-0x0f: [register]
								case 'a':
									if(!pointer) pack(0x00);
									else pack(0x08);
									break;
								case 'b':
									if(!pointer) pack(0x01);
									else pack(0x09);
									break;
								case 'c':
									if(!pointer) pack(0x02);
									else pack(0x0a);
									break;
								case 'x':
									if(!pointer) pack(0x03);
									else pack(0x0b);
									break;
								case 'y':
									if(!pointer) pack(0x04);
									else pack(0x0c);
									break;
								case 'z':
									if(!pointer) pack(0x05);
									else pack(0x0d);
									break;
								case 'i':
									if(!pointer) pack(0x06);
									else pack(0x0e);
									break;
								case 'j':
									if(!pointer) pack(0x07);
									else pack(0x0f);
									break;

								//0x18: POP / [SP++]
								case 'sp++':
								case 'pop':
									pack(0x18);
									break;

								//0x19: PEEK / [SP]
								case 'sp':
									if(pointer) pack(0x19);
									else pack(0x1b);
									break;
								case 'peek':
									pack(0x19);
									break;

								//0x1a: PUSH / [--SP]
								case '--sp':
								case 'push':
									pack(0x1a);
									break;

								//0x1c: PC
								case 'pc':
									pack(0x1c);
									break;

								//0x1d: O
								case 'o':
									pack(0x1d);
									break;

								default:
									if(arg) {
										pack(0x1f);
										subroutineQueue.push({
											id: arg,
											address: address + words.length
										});
										words.push(0x0000);
									}
									break;
							}
						}

						operand++;
					};

					var words = [dcpu.opcodes[op]],
						operand = 0;

					if(words[0] & 0xf) {
						parse(a);
						parse(b);
					} else {
						operand++;
						parse(a);
					}

					for(var j in words) dcpu.mem[address++] = words[j];
					instruction++;
					//console.log('Added instruction %d (%s, %s, %s)', instruction, op, a, b);
					for(var j in words) console.log(j + ': ' + dcpu.formatWord(words[j]));
				} else {
					throw new Error('Invalid opcode (' + op + ')');
				}
			}
		}

		for(var i in subroutineQueue) {
			var sr = subroutineQueue[i];
			if(typeof subroutines[sr.id] === 'number') {
				dcpu.mem[sr.address] = subroutines[sr.id];
			} else {
				throw new Error('Subroutine ' + sr.id + ' was not defined (address ' + sr.address + ')');
			}
		}
	};
	dcpu.isWhitespace = function(character) {
		return ['\n', '\r', '\t', ' '].indexOf(character) !== -1;
	};
	dcpu.getToken = function(string) {
		return string.split(' ')[0].split('\t')[0];
	};

	dcpu.opcodes = {
		'SET': 0x01,
		'ADD': 0x02,
		'SUB': 0x03,
		'MUL': 0x04,
		'DIV': 0x05,
		'MOD': 0x06,
		'SHL': 0x07,
		'SHR': 0x08,
		'AND': 0x09,
		'BOR': 0x0a,
		'XOR': 0x0b,
		'IFE': 0x0c,
		'IFN': 0x0d,
		'IFG': 0x0e,
		'IFB': 0x0f,

		'JSR': 0x10,
		'BRK': 0x20,
		'GET': 0x40
	};

	dcpu.clear();

	dcpu.formatWord = function(word) {
		if(typeof word !== 'undefined') {
			if(word > dcpu.maxValue) word = dcpu.maxValue;
			word = word.toString(16);
			while(word.length < 4) word = '0' + word;
			return word;
		} else {
			return 'null';
		}
	};

	dcpu.getDump = function() {
		var output = '';

		output += '==== REGISTERS: ====\n'
				+ 'A:  ' + dcpu.formatWord(dcpu.mem.a) + '\n'
				+ 'B:  ' + dcpu.formatWord(dcpu.mem.b) + '\n'
				+ 'C:  ' + dcpu.formatWord(dcpu.mem.c) + '\n'
				+ 'X:  ' + dcpu.formatWord(dcpu.mem.x) + '\n'
				+ 'Y:  ' + dcpu.formatWord(dcpu.mem.y) + '\n'
				+ 'Z:  ' + dcpu.formatWord(dcpu.mem.z) + '\n'
				+ 'I:  ' + dcpu.formatWord(dcpu.mem.i) + '\n'
				+ 'J:  ' + dcpu.formatWord(dcpu.mem.j) + '\n\n';

		output += 'PC: ' + dcpu.formatWord(dcpu.mem.pc) + '\n'
				+ 'SP: ' + dcpu.formatWord(dcpu.mem.stack) + '\n'
				+ 'O:  '+ dcpu.formatWord(dcpu.mem.o) + '\n\n';

		output += 'CPU CYCLES: ' + dcpu.cycle + '\n\n';

		output += '======= RAM: =======';
		for(var i = 0; i < dcpu.ramSize; i += 8) {
			var populated = false;
			for(var j = 0; j < 8; j++) {
				if(dcpu.mem[i+j] || dcpu.mem.pc === i + j || dcpu.mem.stack == i + j) {
					populated = true; break;
				}
			}

			if(populated) {
				output += '\n' + dcpu.formatWord(i) + ':';

				for(var j = 0; j < 8; j++) {
					if(dcpu.mem.pc === i + j) output += '[';
					else if(dcpu.mem.pc === i + j - 1) output += ']';
					else if(dcpu.mem.stack === i + j) output += '*';
					else if(dcpu.mem.stack === i + j - 1) output += '*';
					else output += ' ';

					output += dcpu.formatWord(dcpu.mem[i + j]);
				}
			}
		}

		return output;
	};
})();
