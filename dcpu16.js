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
	
	//RUNTIME FUNCTIONS
	dcpu.get = function(value) {
		switch(value) {
			case '0x00': return dcpu.mem.a;
			case '0x01': return dcpu.mem.b;
			case '0x02': return dcpu.mem.c;
			case '0x03': return dcpu.mem.x;
			case '0x04': return dcpu.mem.y;
			case '0x05': return dcpu.mem.z;
			case '0x06': return dcpu.mem.i;
			case '0x07': return dcpu.mem.j;
			
			case '0x08': return dcpu.mem[dcpu.mem.a];
			case '0x09': return dcpu.mem[dcpu.mem.b];
			case '0x0a': return dcpu.mem[dcpu.mem.c];
			case '0x0b': return dcpu.mem[dcpu.mem.x];
			case '0x0c': return dcpu.mem[dcpu.mem.y];
			case '0x0d': return dcpu.mem[dcpu.mem.z];
			case '0x0e': return dcpu.mem[dcpu.mem.i];
			case '0x0f': return dcpu.mem[dcpu.mem.j];
			
			
		}
	};
	dcpu.exec = function(word) {
		var opcode = word & 0xf,
			a = word & 0x3f0,
			b = word & 0xfc00;
		switch(opcode) {
			case 0x0:
				switch(a) {
					case 0x01: 
						dcpu.stack.push(dcpu.mem.sp + 1);
						dcpu.mem.pc = b;
						dcpu.cycle += 2; //TODO: plus the cost of a?
						break;
				}
				break;
			case 0x1:
				dcpu.mem[a] = dcpu.mem[b];
				dcpu.cycle += 1;
				break;
			case 0x2:
				var result = dcpu.mem[a] + dcpu.mem[b];
				if(result > dcpu.maxValue) {
					result = dcpu.maxValue;
					dcpu.mem.o = 0x0001;
				} else {
					dcpu.mem.o = 0x0000;
				}
				dcpu.mem[a] = result;
				
				dcpu.cycle += 2; //TODO: plus the cost of a and b?
				break;
			case 0x3:
				var result = dcpu.mem[a] - dcpu.mem[b];
				if(result < 0x0000) {
					result = 0x0000;
					dcpu.mem.o = dcpu.maxValue;
				} else {
					dcpu.mem.o = 0x0000;
				}
				dcpu.mem[a] = result;
				
				dcpu.cycle += 2; //TODO: plus the cost of a and b?
				break;
			case 0x4:
				dcpu.mem[a] *= dcpu.mem[b];
				dcpu.mem.o = ((dcpu.mem[a]) >> 16) & 0xffff;
				
				dcpu.cycle += 2; //TODO: plus the cost of a and b?
				break;
			case 0x5:
				dcpu.mem[a] /= dcpu.mem[b];
				if(dcpu.mem[b] === 0) {
					dcpu.mem.o = 0x0000;
				} else {
					dcpu.mem.o = ((dcpu.mem[a] << 16) / dcpu.mem[b]) & 0xffff;
				}
				dcpu.cycle += 3; //TODO: plus the cost of a and b?
				break;
			case 0x6:
				if(dcpu.mem[b] === 0) {
					dcpu.mem[a] = 0x0000;
				} else {
					dcpu.mem[a] %= dcpu.mem[b];
				}
				dcpu.cycle += 2; //TODO: plus the cost of a and b?
					break;
			case 0x7:
				dcpu.mem[a] = dcpu.mem[a] << dcpu.mem[b];
				dcpu.mem.o = (dcpu.mem[a] >> 16) & 0xffff;
				dcpu.cycle += 2; //TODO: plus the cost of a and b?
				break;
			case 0x8:
				var result = dcpu.mem[a] >> dcpu.mem[b];
				dcpu.mem.o = ((dcpu.mem[a] << 16) >> dcpu.mem[b]) & 0xffff;
				dcpu.cycle += 2; //TODO: plus the cost of a and b?
				break;
			case 0x9:
				dcpu.mem[a] &= dcpu.mem[b];
				dcpu.cycle += 1; //TODO: plus the cost of a and b?
				break;
			case 0xa:
				dcpu.mem[a] |= dcpu.mem[b];
				dcpu.cycle += 1; //TODO: plus the cost of a and b?
				break;
			case 0xb:
				dcpu.mem[a] ^= dcpu.mem[b];
				dcpu.cycle += 1; //TODO: plus the cost of a and b?
				break;
			case 0xc:
				if(dcpu.mem[a] != dcpu.mem[b]) {
					dcpu.mem.pc++;
					dcpu.cycle += 1;
				}
				dcpu.cycle += 1; //TODO: plus the cost of a and b?
				break;
			case 0xd:
				if(dcpu.mem[a] == dcpu.mem[b]) {
					dcpu.mem.pc++;
					dcpu.cycle += 1;
				}
				dcpu.cycle += 1; //TODO: plus the cost of a and b?
				break;
			case 0xe:
				if(dcpu.mem[a] <= dcpu.mem[b]) {
					dcpu.mem.pc++;
					dcpu.cycle += 1;
				}
				dcpu.cycle += 1; //TODO: plus the cost of a and b?
				break;
			case 0xf:
				if(dcpu.mem[a] & dcpu.mem[b] == 0) {
					dcpu.mem.pc++;
					dcpu.cycle += 1;
				}
				dcpu.cycle += 1; //TODO: plus the cost of a and b?
				break;
			default:
				throw new Error('Encountered invalid opcode 0x' + opcode.toString(16));
		}
	};
	
	//COMPILATION FUNCTIONS
	dcpu.compile = function(code) {		
		var subroutines = {},
			lineNumber = 1,
			instruction = 0,
			address = 0;
		
		code += '\n\n';
		
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
						var identifier = dcpu.getToken(line.substr(i+1));
						
						var firstChar = identifier.charCodeAt(0);
						if(firstChar >= 48 && firstChar <= 57)
							throw new Error('Identifiers cannot start with a number (' + identifier + ')');
						
						subroutines[identifier] = instruction;
						i += identifier.length;
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
						} else {
							throw new Error('Unexpected token');
						}
					}
				}
			}
			
			if(op) {
				if(dcpu.opcodes[op]) {
					var words = [dcpu.opcodes[op]],
						operand = 0;
					parse(a);
					parse(b);
					
					for(var j in words) dcpu.mem[address++] = words[j];
					instruction++;
					console.log('Added instruction %d (%s, %s, %s)', instruction, op, a, b);
					for(var j in words) console.log(j + ': ' + dcpu.formatWord(words[j]));
					
					function parse(arg) {
						var pointer = false;
						if(arg.charAt(0) == '[' && arg.charAt(arg.length - 1) == ']') {
							pointer = true;
							arg = arg.substring(1, arg.length - 1);
						}
						
						//next word + register
						if(parseInt(arg.split('+')[0]) && dcpu.mem[arg.split('+')[1]]) {
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
						//literals/pointers, subroutines
						} else if(parseInt(arg) || subroutines[arg]) {
							var value = parseInt(arg) || subroutines[arg];
							
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
									throw new Error('Invalid symbol ' + arg);
							}
						}
						
						operand++;
					};
					function pack(value) {
						words[0] += value << (4 + operand * 6);
					};
				} else {
					throw new Error('Invalid opcode (' + op + ')');
				}
			}
			lineNumber++;
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
		
		'JSR': 0x10
	};
	
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
	dcpu.mem.sp = 0;
	dcpu.mem.o = 0;
	for(var i = 0; i < dcpu.ramSize; i++) dcpu.mem[i] = 0;
	
	dcpu.cycle = 0;
	
	dcpu.formatWord = function(word) {
		word = word.toString(16);
		while(word.length < 4) word = '0' + word;
		return word;
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
				+ 'SP: ' + dcpu.formatWord(dcpu.mem.sp) + '\n'
				+ 'O:  '+ dcpu.formatWord(dcpu.mem.o) + '\n\n';
				
		output += 'CPU CYCLES: ' + dcpu.formatWord(dcpu.cycle) + '\n\n';
		
		output += '======= RAM: =======';
		for(var i = 0; i < dcpu.ramSize; i++) {
			if(i % 8 === 0) output += '\n' + dcpu.formatWord(i) + ':';
			
			if(dcpu.mem.pc === i) output += '[';
			else if(dcpu.mem.pc === i-1) output += ']';
			else output += ' ';
			
			output += dcpu.formatWord(dcpu.mem[i]);
		}
					
		return output;		
	};
})();
