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
	
	//RUNTIME FUNCTIONS
	dcpu.step = function() {
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
				
				case 0x10: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc + skip++] + dcpu.mem.a;
				case 0x11: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc + skip++] + dcpu.mem.b;
				case 0x12: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc + skip++] + dcpu.mem.c;
				case 0x13: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc + skip++] + dcpu.mem.x;
				case 0x14: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc + skip++] + dcpu.mem.y;
				case 0x15: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc + skip++] + dcpu.mem.z;
				case 0x16: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc + skip++] + dcpu.mem.i;
				case 0x17: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc + skip++] + dcpu.mem.j;
				
				case 0x18: if(dcpu.mem.stack <= 0xffff) return ++dcpu.mem.stack;
						   else return dcpu.mem.stack; 
				case 0x19: return dcpu.mem.stack;
				case 0x1a: if(dcpu.mem.stack > 0) return dcpu.mem.stack--;
				
				case 0x1b: return 'stack';
				case 0x1c: return 'pc';
				case 0x1d: return 'o';
				
				case 0x1e:
				case 0x1f: dcpu.cycle++; return dcpu.mem[dcpu.mem.pc + skip++];
				
				default: return value - 0x20;
			}
		};
		dcpu.set = function(key, value) {
			if(value > dcpu.maxValue) value = dcpu.maxValue;
			if(value < 0) value = 0;
			
			if(key === 'pc' && value === dcpu.mem.pc) dcpu.stop();
			
			//console.log('Setting dcpu.mem[' + key + '] to ' + value);
			dcpu.mem[key] = value;
			
			if(key === 'pc') pcSet = true;
			
			if(key >= dcpu.screenOffset
			&& key <= dcpu.screenOffset + dcpu.screenLength) dcpu.print();
		};
		dcpu.getSize = function(word) {
			var opcode = word & 0xf,
				a = (word & 0x3f0) >> 4,
				b = (word & 0xfc00) >> 10;
				var output = 1;
			
			if((a >= 0x10 && a <= 0x17) || a === 0x1e || a === 0x1f) output++;
			if((b >= 0x10 && b <= 0x17) || b === 0x1e || b === 0x1f) output++;
			
			return output;
		};
		dcpu.isLiteral = function(value) {
			if(value >= 0x1f && value <= 0x3f) return true;
			else return false;
		};
		
		var skip = 1,
			word = dcpu.mem[dcpu.mem.pc],
			opcode = word & 0xf;
		var a = dcpu.get((word & 0x3f0) >> 4),
			b = dcpu.get((word & 0xfc00) >> 10);
		var lA = dcpu.isLiteral((word & 0x3f0) >> 4),
			lB = dcpu.isLiteral((word & 0xfc00) >> 10);	
		var aVal = lA ? a : dcpu.mem[a];
		var bVal = lB ? b : dcpu.mem[b];
		var pcSet = false;
		
		console.log(dcpu.formatWord(opcode), '|',
			dcpu.formatWord((word & 0x3f0) >> 4), dcpu.formatWord((word & 0xfc00) >> 10), '|',
			dcpu.formatWord(a), dcpu.formatWord(b), '|',
			dcpu.formatWord(aVal), dcpu.formatWord(bVal));
			
		if(!lA) {			
			var prePc = dcpu.mem.pc;
			switch(opcode) {
				case 0x0:
					switch((word & 0x3f0) >> 4) {
						case 0x01: 
							dcpu.mem[dcpu.mem.stack--] = dcpu.mem.pc + dcpu.getSize(dcpu.mem[dcpu.mem.pc]);
							dcpu.set('pc', bVal);
							dcpu.cycle += 2; //TODO: plus the cost of a?
							break;
							
						case 0x02:
							dcpu.stop();
							break;
						
						case 0x03:
							if(!dcpu._inputBuffer) {
								dcpu.set(bVal, 0);
							} else {
								dcpu.set(bVal, dcpu._inputBuffer.charCodeAt(0));
								dcpu._inputBuffer = dcpu._inputBuffer.substr(1);
							}
							break;
					}
					break;
				case 0x1:
					dcpu.set(a, bVal);
					dcpu.cycle += 1;
					break;
				case 0x2:
					var result = aVal + bVal;
					if(result > dcpu.maxValue) {
						result = dcpu.maxValue;
						dcpu.mem.o = 0x0001;
					} else {
						dcpu.mem.o = 0x0000;
					}
					dcpu.set(a, result);
					
					dcpu.cycle += 2; //TODO: plus the cost of a and b?
					break;
				case 0x3:
					var result = aVal - bVal;
					if(result < 0x0000) {
						result = 0x0000;
						dcpu.mem.o = dcpu.maxValue;
					} else {
						dcpu.mem.o = 0x0000;
					}
					dcpu.set(a, result);
					
					dcpu.cycle += 2; //TODO: plus the cost of a and b?
					break;
				case 0x4:
					dcpu.set(a, aVal * bVal);
					dcpu.mem.o = ((aVal * bVal) >> 16) & 0xffff;
					
					dcpu.cycle += 2; //TODO: plus the cost of a and b?
					break;
				case 0x5:
					
					if(bVal === 0) {
						dcpu.mem.o = 0x0000;
					} else {
						dcpu.set(a, Math.floor(aVal / bVal));
						dcpu.mem.o = ((aVal << 16) / bVal) & 0xffff;
					}
					dcpu.cycle += 3; //TODO: plus the cost of a and b?
					break;
				case 0x6:
					if(bVal === 0) {
						dcpu.set(a, 0x0000);
					} else {
						dcpu.set(a, aVal % bVal);
					}
					dcpu.cycle += 2; //TODO: plus the cost of a and b?
						break;
				case 0x7:
					dcpu.set(a, aVal << bVal);
					dcpu.mem.o = (aVal >> 16) & 0xffff;
					dcpu.cycle += 2; //TODO: plus the cost of a and b?
					break;
				case 0x8:
					dcpu.set(a, aVal >> bVal);
					dcpu.mem.o = ((aVal << 16) >> bVal) & 0xffff;
					dcpu.cycle += 2; //TODO: plus the cost of a and b?
					break;
				case 0x9:
					dcpu.set(a, aVal & bVal);
					dcpu.cycle += 1; //TODO: plus the cost of a and b?
					break;
				case 0xa:
					dcpu.set(a, aVal | bVal);
					dcpu.cycle += 1; //TODO: plus the cost of a and b?
					break;
				case 0xb:
					dcpu.set(a, aVal ^ bVal);
					dcpu.cycle += 1; //TODO: plus the cost of a and b?
					break;
				case 0xc:
					if(aVal !== bVal) {
						dcpu.set('pc', dcpu.mem.pc + dcpu.getSize(dcpu.mem[dcpu.mem.pc + 1]) + 1);
						dcpu.cycle += 1;
					}
					dcpu.cycle += 2; //TODO: plus the cost of a and b?
					break;
				case 0xd:
					if(aVal === bVal) {
						dcpu.set('pc', dcpu.mem.pc + dcpu.getSize(dcpu.mem[dcpu.mem.pc + 1]) + 1);
						dcpu.cycle += 1;
					}
					dcpu.cycle += 2; //TODO: plus the cost of a and b?
					break;
				case 0xe:
					if(aVal <= bVal) {
						dcpu.set('pc', dcpu.mem.pc + dcpu.getSize(dcpu.mem[dcpu.mem.pc + 1]) + 1);
						dcpu.cycle += 1;
					}
					dcpu.cycle += 2; //TODO: plus the cost of a and b?
					break;
				case 0xf:
					if(aVal & bVal == 0) {
						dcpu.set('pc', dcpu.mem.pc + dcpu.getSize(dcpu.mem[dcpu.mem.pc + 1]) + 1);
						dcpu.cycle += 1;
					}
					dcpu.cycle += 2; //TODO: plus the cost of a and b?
					break;
				default:
					throw new Error('Encountered invalid opcode 0x' + opcode.toString(16));
			}
		}
		if(!pcSet) dcpu.mem.pc += dcpu.getSize(word);
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
						&& (parseInt(arg.split('+')[0]) || parseInt(arg.split('+')[0]) === 0)
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
