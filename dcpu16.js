/*
Copyright (c) 2012 Matt Bell

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// namespace
var DCPU16 = {};
(function() {'use strict';
    DCPU16.formatWord = function(word) {

        if( typeof word === 'undefined') {
            return 'null';
        }
        word &= 0xFFFF;
        word = word.toString(16);
        while(word.length < 4) {
            word = '0' + word;
        }

        return word;
    };
    
    DCPU16.basicOpcodeCost = [0, 1, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 2, 2, 2, 2];
    DCPU16.nonBasicOpcodeCost = [0, 2, 0];
    DCPU16.registerNames = ['a', 'b', 'c', 'x', 'y', 'z', 'i', 'j'];

    DCPU16.CPU = ( function() {

        var basicOpcodeCost = DCPU16.basicOpcodeCost,
            nonBasicOpcodeCost = DCPU16.nonBasicOpcodeCost,
            registerNames = DCPU16.registerNames;

        var CPU = function CPU() {
            this.mem = [];
            this.ramSize = 0x10000;
            //ram size in words
            this.wordSize = 2;
            //word size in bytes
            this.maxValue = Math.pow(2, this.wordSize * 8) - 1;
            //max value of words
            this.mem.length = this.ramSize;

            this.throttled = true; //whether or not to control speed
            this.speedScale = 14; //how fast to auto-adjust execution speed
           						   // (higher means smoother speeds, lower means more accuracy)
           						   
            this.speed = 100000; //speed in hz
            this.loopBatch = 1600; //the number of loops to execute at a time in run

            this._stop = false;
            this._endListeners = [];
            this._devices = [];

            this.clear();
        };
        // Gets the instruction length for a given word.
        // TODO: Fix for non-basic opcodes, which have a different format.
        function getLength(word) {
            var//(unused) opcode = word & 0xF,
            a = (word >> 4) & 0x3F, b = (word >> 10) & 0x3F, length = 1;

            if((a >= 0x10 && a <= 0x17) || a === 0x1e || a === 0x1f) {
                length++;
            }
            if((b >= 0x10 && b <= 0x17) || b === 0x1e || b === 0x1f) {
                length++;
            }
            return length;
        }

        function isLiteral(value) {
            return (value >= 0x20 && value <= 0x3f);
        }


        CPU.prototype = {
            // Returns the memory address at which the value resides.
            addressFor: function(value) {
                var r, address;
                // Handle the simple register cases first
                if(value <= 0x17) {
                    r = registerNames[value % 8];
                    if(0x00 <= value && value <= 0x07) {
                        address = r;
                    } else if(0x08 <= value && value <= 0x0F) {
                        address = this.mem[r];
                    } else {
                        this.cycle++;
                        address = this.mem[this.mem.pc] + this.mem[r];
                        this.set('pc', this.mem.pc + 1);
                    }
                    return address;
                }

                // Literals
                if(isLiteral(value)) {
                    return value - 0x20;
                }

                // Other kinds of values
                switch(value) {
                    // stack pointer
                    case 0x18:
                        var pre = this.mem.stack;
                        this.set('stack', this.mem.stack + 1);
                        return pre;
                    case 0x19:
                        return this.mem.stack;
                    case 0x1a:
                        this.set('stack', this.mem.stack - 1);
                        return this.mem.stack;

                    // other registers
                    case 0x1b:
                        return 'stack';
                    case 0x1c:
                        return 'pc';
                    case 0x1d:
                        return 'o';

                    // extended instruction values
                    case 0x1e:
                        this.cycle++;
                        var output = this.mem[this.mem.pc];
                        this.set('pc', this.mem.pc + 1);
                        return output;
                    case 0x1f:
                        this.cycle++;
                        var output = this.mem.pc;
                        this.set('pc', this.mem.pc + 1);
                        return output;

                    default:
                        throw new Error('Encountered unknown argument type 0x' + value.toString(16));
                }
            },
            get: function(key) {
                var device = this.getDevice(key), value;
                if(device !== null) {
                    value = (device.onGet) ? device.onGet(key - device.start) : 0x0000;
                } else {
                    value = this.mem[key];
                }
                return value;
            },
            // Assigns 'value' into the memory location referenced by 'key'
            set: function(key, value) {
                // Ensure the value is within range
                value &= this.maxValue;

                var device = this.getDevice(key);
                if(device !== null) {
                    if(device.onSet) {
                        device.onSet(key - device.start, value);
                    }
                } else {
                    this.mem[key] = value;
                }
            },
            step: function() {
                // Fetch the instruction
                var word = this.mem[this.mem.pc], opcode = word & 0xF, a = (word >> 4) & 0x3F, b = (word >> 10) & 0x3F, aVal, aRaw, bVal, result;
                this.set('pc', this.mem.pc + 1);

                if(opcode === 0) {
                    // Non-basic
                    opcode = a;
                    a = b;
                    aRaw = this.addressFor(a);
                    aVal = isLiteral(a) ? aRaw : this.get(aRaw);

                    switch(opcode) {
                    	//null
                    	case 0x00:
                    		this.cycle++;
                    		break;
                    		
                        // JSR
                        case 0x01:
                            this.set('stack', this.mem.stack - 1);
                            this.mem[this.mem.stack] = this.mem.pc;
                            this.mem.pc = aVal;
                            break;

                        // BRK (non-standard)
                        case 0x02:
                            this.stop();
                            break;
                    }
                    this.cycle += nonBasicOpcodeCost[opcode] || 0;
                } else {
                    // Basic
                    aRaw = this.addressFor(a);
                    aVal = isLiteral(a) ? aRaw : this.get(aRaw);
                    bVal = isLiteral(b) ? this.addressFor(b) : this.get(this.addressFor(b));

                    switch (opcode) {
                        // SET
                        case 0x1:
                            if(!isLiteral(a)) {
                                this.set(aRaw, bVal);
                            }
                            break;

                        // ADD
                        case 0x2:
                            result = aVal + bVal;
                            this.mem.o = (result > this.maxValue) ? 0x0001 : 0x0000;

                            if(!isLiteral(a)) {
                                this.set(aRaw, result);
                            }
                            break;

                        // SUB
                        case 0x3:
                            result = aVal - bVal;
                            this.mem.o = (result < 0) ? this.maxValue : 0x0000;

                            if(!isLiteral(a)) {
                                this.set(aRaw, result);
                            }
                            break;

                        // MUL
                        case 0x4:
                            result = aVal * bVal;
                            this.mem.o = (result >> 16) & this.maxValue;

                            if(!isLiteral(a)) {
                                this.set(aRaw, result);
                            }
                            break;

                        // DIV
                        case 0x5:
                            if(bVal === 0) {
                                result = 0x0000;
                                this.mem.o = 0x0000;
                            } else {
                                result = Math.floor(aVal / bVal);
                                this.mem.o = ((aVal << 16) / bVal) & this.maxValue;
                            }

                            if(!isLiteral(a)) {
                                this.set(aRaw, result);
                            }
                            break;

                        // MOD
                        case 0x6:
                            if(!isLiteral(a)) {
                                this.set(aRaw, (bVal === 0) ? 0x0000 : aVal % bVal);
                            }
                            break;

                        // SHL
                        case 0x7:
                            this.mem.o = ((aVal << bVal) >> 16) & this.maxValue;
                            if(!isLiteral(a)) {
                                this.set(aRaw, aVal << bVal);
                            }
                            break;

                        // SHR
                        case 0x8:
                            this.mem.o = ((aVal << 16) >> bVal) & this.maxValue;
                            if(!isLiteral(a)) {
                                this.set(aRaw, aVal >> bVal);
                            }
                            break;

                        // AND
                        case 0x9:
                            if(!isLiteral(a)) {
                                this.set(aRaw, aVal & bVal);
                            }
                            break;

                        // BOR
                        case 0xa:
                            if(!isLiteral(a)) {
                                this.set(aRaw, aVal | bVal);
                            }
                            break;

                        // XOR
                        case 0xb:
                            if(!isLiteral(a)) {
                                this.set(aRaw, aVal ^ bVal);
                            }
                            break;

                        // IFE
                        case 0xc:
                            if(aVal !== bVal) {
                                this.mem.pc += getLength(this.get(this.mem.pc));
                                this.cycle += 1;
                            }
                            break;

                        // IFN
                        case 0xd:
                            if(aVal === bVal) {
                                this.mem.pc += getLength(this.get(this.mem.pc));
                                this.cycle += 1;
                            }
                            break;

                        // IFG
                        case 0xe:
                            if(aVal <= bVal) {
                                this.mem.pc += getLength(this.get(this.mem.pc));
                                this.cycle += 1;
                            }
                            break;

                        // IFB
                        case 0xf:
                            if((aVal & bVal) === 0) {
                                this.mem.pc += getLength(this.get(this.mem.pc));
                                this.cycle += 1;
                            }
                            break;

                        default:
                            throw new Error('Encountered invalid opcode 0x' + opcode.toString(16));
                    }

                    this.cycle += basicOpcodeCost[opcode];
                }
            },
            run: function(onLoop) {
                var $this = this, startTime = new Date().getTime();
                var stackCounter = 0;
                this.running = true;
				
                function loop() {
                    if(!$this._stop && $this.running) {
                    	for(var i = 0; i < $this.loopBatch; i++) {
                        	$this.step();
                        }
						
						
						if($this.throttled) {
							var throttledTime = $this.cycle / ($this.speed / 1000),
							realTime = new Date().getTime() - startTime;
							
							setTimeout(loop, Math.round(throttledTime - realTime));
						} else {
	                        if( typeof process !== 'undefined' && process.nextTick) {
	                            process.nextTick(loop);
	                        } else {
	                            setTimeout(loop, 0);
	                        }
                        }
                        
                        if(onLoop) {
                            setTimeout(onLoop, 0);
                        }
                    } else if($this.running) {
                        $this.end();
                    }
                }

                loop();
            },
            stop: function() {
                if(this.running)
                    this._stop = true;
            },
            clear: function() {
                var i = 0, _len;
                for( _len = registerNames.length; i < _len; ++i) {
                    this.mem[registerNames[i]] = 0;
                }
                for( i = 0, _len = this.ramSize; i < _len; ++i) {
                    this.mem[i] = 0;
                }

                this.mem.pc = 0;
                this.mem.stack = 0;
                this.mem.o = 0;
                this.cycle = 0;

                this._inputBuffer = '';
                this.running = false;

                this.timer = 0;
            },
            mapDevice: function(where, length, callbacks) {
                var i, _len = this._devices.length, device;
                // Make sure there's space available
                for( i = 0; i < _len; ++i) {
                    device = this._devices[i];
                    if((device.start <= where && where <= device.end) || (where <= device.start && device.start <= where + length - 1)) {
                        return false;
                    }
                }

                this._devices.push({
                    start: where,
                    end: where + length - 1,
                    onGet: callbacks.get || null,
                    onSet: callbacks.set || null
                });

                return true;
            },
            unmapDevice: function(where) {
                var i, _len = this._devices.length, device;

                for( i = 0; i < _len; ++i) {
                    device = this._devices[i];
                    if(device.start === where) {
                        this._devices.splice(i, 1);
                        break;
                    }
                }
            },
            getDevice: function(index) {
                var i, _len = this._devices.length, device;
                for( i = 0; i < _len; ++i) {
                    device = this._devices[i];
                    if(device.start <= index && index <= device.end) {
                        return device;
                    }
                }

                return null;
            },
            end: function() {
                var i, _len = this._endListeners.length;
                for( i = 0; i < _len; ++i) {
                    this._endListeners[i]();
                }
                this._stop = false;
                this.running = false;
            },
            //EVENT LISTENER REGISTRATION
            onEnd: function(callback) {
                this._endListeners.push(callback);
            },
            getDump: function() {
                var output = '', populated, i, j;
                output += '==== REGISTERS: ====\n';
                output += 'A:  ' + DCPU16.formatWord(this.mem.a) + '\n';
                output += 'B:  ' + DCPU16.formatWord(this.mem.b) + '\n';
                output += 'C:  ' + DCPU16.formatWord(this.mem.c) + '\n';
                output += 'X:  ' + DCPU16.formatWord(this.mem.x) + '\n';
                output += 'Y:  ' + DCPU16.formatWord(this.mem.y) + '\n';
                output += 'Z:  ' + DCPU16.formatWord(this.mem.z) + '\n';
                output += 'I:  ' + DCPU16.formatWord(this.mem.i) + '\n';
                output += 'J:  ' + DCPU16.formatWord(this.mem.j) + '\n\n';
                output += 'PC: ' + DCPU16.formatWord(this.mem.pc) + '\n';
                output += 'SP: ' + DCPU16.formatWord(this.mem.stack) + '\n';
                output += 'O:  ' + DCPU16.formatWord(this.mem.o) + '\n\n';
                output += 'CPU CYCLES: ' + this.cycle + '\n\n';
                output += '======= RAM: =======';
                for( i = 0; i < this.ramSize; i += 8) {
                    populated = false;
                    for( j = 0; j < 8; j++) {
                        if(this.mem[i + j] || this.mem.pc === i + j || this.mem.stack === i + j) {
                            populated = true;
                            break;
                        }
                    }

                    if(populated) {
                        output += '\n' + DCPU16.formatWord(i) + ':';

                        for( j = 0; j < 8; j++) {
                            if(this.mem.pc === i + j) {
                                output += '[';
                            } else if(this.mem.pc === i + j - 1) {
                                output += ']';
                            } else if(this.mem.stack === i + j) {
                                output += '*';
                            } else if(this.mem.stack === i + j - 1) {
                                output += '*';
                            } else {
                                output += ' ';
                            }
                            output += DCPU16.formatWord(this.mem[i + j]);
                        }
                    }
                }

                return output;
            }
        };

        return CPU;
    }());

    DCPU16.Assembler = ( function() {

        var opcodes = {
            //assembler directives
            'DAT': null,

            //simple ops
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

            //non-simple ops
            'JSR': 0x10,
            'BRK': 0x20
        };

        function Assembler(cpu) {
            this.cpu = cpu;
            this.instructionMap = [];
            this.addressMap = [];
            this.instruction = 0;
        }

        function isWhitespace(character) {
            return ['\n', '\r', '\t', ' ', ','].indexOf(character) !== -1;
        }

        function getToken(string) {
            return string.split(' ')[0].split('\t')[0].split(',')[0];
        }


        Assembler.prototype = {
            serialize: function(code) {
                var i, j, line, lineNumber = 1, op, args, c, output = {
                    instructions: [],
                    subroutines: {}
                };
                code += '\n';
                while(code.length > 0) {
                    line = code.substr(0, code.indexOf('\n')).split(';')[0];

                    if(code.indexOf('\n') === -1) {
                        break;
                    } else {
                        code = code.substr(code.indexOf('\n') + 1);
                    }
                    op = '';
                    args = [];

                    for( i = 0; i < line.length; i++) {
                        c = line.charAt(i);
                        if(!isWhitespace(c)) {
                            if(c === ';') {
                                break;
                            } else if(c === ':' && !op) {
                                output.subroutines[getToken(line.substr(i + 1)).toLowerCase()] = output.instructions.length;
                                i += getToken(line.substr(i)).length;
                            } else {
                                if(!op) {
                                    op = getToken(line.substr(i));
                                    i += op.length;
                                } else {
                                    var arg;

                                    if(line.charAt(i) === '"') {
                                        for( j = i + 1; j < line.length; j++) {
                                            if(line.charAt(j) === '"' && (line.charAt(j - 1) !== '\\' || line.charAt(j - 2) === '\\')) {
                                                arg = line.substring(i, j + 1);
                                                break;
                                            }
                                        }
                                        if(!arg)
                                            throw new Error('Unterminated string literal');
                                    } else if(line.charAt(i) === '[') {
                                        for(j = i + 1; j < line.length; j++) {
                                            if(line.charAt(j) === ']') {
                                                arg = line.substring(i, j + 1);
                                                break;
                                            }
                                        }
                                        if(!arg)
                                            throw new Error('Unclosed pointer brackets');
                                    } else {
                                        arg = getToken(line.substr(i));
                                        
                                        if(arg.indexOf(':') !== -1) {
	                                    	throw new Error('Illegal symbol ":"');
	                                    }
                                    }
                                    i += arg.length ;

                                    if(opcodes[op] !== null
                                    	&& ((opcodes[op] > 0xff && args.length > 1) || (opcodes[op] < 0xff && args.length > 2))) {
                                        throw new Error('Invalid amount of arguments for op ' + op);
                                    }

                                    if(arg.length > 0)
                                        args.push(arg);
                                }
                            }
                        }
                    }

                    if(op) {
                        var instruction = [];
                        instruction.push(op);
                        var len = args.length;
                        for( i = 0; i < len; i++)
                        instruction.push(args[i]);
                        output.instructions.push(instruction);

                        this.instructionMap.push(lineNumber);
                    }
                    lineNumber++;
                }
                return output;
            },
            compile: function(code) {
                this.instruction = 0;
                var serialized = this.serialize(code);

                var i, j, address = 0;
                var subroutineQueue = [];
                var cpu = this.cpu, value, words, operand, line, op, args, sr, c;

                function pack(value) {
                    if(opcodes[op] !== null)
                        words[0] += value << (4 + operand * 6);
                }

                function parse(arg) {
                    arg = arg.replace('\t', '').replace('\n', '');

                    var pointer = false, offset;
                    if(arg.charAt(0) === '[' && arg.charAt(arg.length - 1) === ']') {
                        pointer = true;
                        arg = arg.substring(1, arg.length - 1);
                    }

                    //string literal
                    if(arg.charAt(0) === '"' && arg.charAt(arg.length - 1) === '"') {
                        arg = arg.substr(1, arg.length - 2);
                        for( j = 0; j < arg.length; j++) {
                            var character;
                            if(arg.charAt(j) === '\\') {
                                switch(arg.charAt(j+1)) {
                                    case 'n':
                                        character = 10;
                                        break;
                                    case 'r':
                                        character = 13;
                                        break;
                                    case 'a':
                                        character = 7;
                                        break;
                                    case '\\':
                                        character = 92;
                                        break;
                                    case '"':
                                        character = 34;
                                        break;
                                    case '0':
                                        character = 0;
                                        break;
                                    default:
                                        throw new Error('Unrecognized string escape (\\' + arg.charAt(j + 1) + ')');
                                }
                                j++;
                            } else {
                                character = arg.charCodeAt(j);
                            }

                            if(opcodes[op] !== null)
                                pack(0x1f);
                            words.push(character);
                        }
                    }

                    //offset + register/register + offset
                    else if(pointer && arg.split('+').length === 2) {
                        var typeError = new Error('Invalid offset pointer, must have 1 literal/subroutine and 1 register');
                        
                        var register, offset, split = arg.replace(/ +?/g,'').split('+');
                        
                        for(var i = 0; i < 2; i++) {
                            if(parseInt(split[i]) || parseInt(split[i]) === 0) {
                                if(!offset) {
                                    offset = parseInt(split[i]);
                                } else {
                                    throw typeError;
                                }

                                if(offset < 0 || offset > 0xffff) {
                                    throw new Error('Invalid offset [' + arg + '], must be between 0 and 0xffff');
                                }

                                words.push(offset);
                            } else if(DCPU16.registerNames.indexOf(split[i].toLowerCase()) !== -1) {
                                if(!register) {
                                    register = split[i].toLowerCase();
                                } else {
                                    throw typeError;
                                }
                            } else {
                                if(!offset) {
                                    subroutineQueue.push({
                                        id: split[i],
                                        address: address + words.length
                                    });
                                    offset = 0;
                                    words.push(0x0000);
                                } else {
                                    throw typeError;
                                }
                            }
                        }

                        switch (register) {
                            case 'a':
                                pack(0x10);
                                break;
                            case 'b':
                                pack(0x11);
                                break;
                            case 'c':
                                pack(0x12);
                                break;
                            case 'x':
                                pack(0x13);
                                break;
                            case 'y':
                                pack(0x14);
                                break;
                            case 'z':
                                pack(0x15);
                                break;
                            case 'i':
                                pack(0x16);
                                break;
                            case 'j':
                                pack(0x17);
                                break;
                            default: throw typeError;
                        }
                    }

                    //literals/pointers
                    else if(parseInt(arg) || parseInt(arg) === 0) {
                        value = parseInt(arg);

                        if(value < 0 || value > 0xffff) {
                            throw new Error('Invalid value 0x' + value.toString(16) + ', must be between 0 and 0xffff');
                        }

                        //0x20-0x3f: literal value 0x00-0x1f (literal)
                        if(!pointer && value <= 0x1f && opcodes[op] !== null) {
                            pack(value + 0x20);
                        } else {
                            //0x1e: [next word]
                            if(pointer) {
                                pack(0x1e);
                            } else {
                                //0x1f: next word (literal)
                                pack(0x1f);
                            }

                            words.push(value);
                        }
                    }

                    //other tokens
                    else {
                        switch (arg.toLowerCase()) {
                            //0x00-0x07: register (A, B, C, X, Y, Z, I or J, in
                            // that
                            // order)
                            //0x08-0x0f: [register]
                            case 'a':
                                if(!pointer) {
                                    pack(0x00);
                                } else {
                                    pack(0x08);
                                }
                                break;
                            case 'b':
                                if(!pointer) {
                                    pack(0x01);
                                } else {
                                    pack(0x09);
                                }
                                break;
                            case 'c':
                                if(!pointer) {
                                    pack(0x02);
                                } else {
                                    pack(0x0a);
                                }
                                break;
                            case 'x':
                                if(!pointer) {
                                    pack(0x03);
                                } else {
                                    pack(0x0b);
                                }
                                break;
                            case 'y':
                                if(!pointer) {
                                    pack(0x04);
                                } else {
                                    pack(0x0c);
                                }
                                break;
                            case 'z':
                                if(!pointer) {
                                    pack(0x05);
                                } else {
                                    pack(0x0d);
                                }
                                break;
                            case 'i':
                                if(!pointer) {
                                    pack(0x06);
                                } else {
                                    pack(0x0e);
                                }
                                break;
                            case 'j':
                                if(!pointer) {
                                    pack(0x07);
                                } else {
                                    pack(0x0f);
                                }
                                break;

                            //0x18: POP / [SP++]
                            case 'sp++':
                            case 'pop':
                                pack(0x18);
                                break;

                            //0x19: PEEK / [SP]
                            case 'sp':
                                if(pointer) {
                                    pack(0x19);
                                } else {
                                    pack(0x1b);
                                }
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
                                    if(pointer) pack(0x1e);
                                    else pack(0x1f);
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
                }

                for(this.instruction = 0; this.instruction < serialized.instructions.length; this.instruction++) {
                    var op = serialized.instructions[this.instruction][0].toUpperCase(), args = serialized.instructions[this.instruction].slice(1);
                    if( typeof op !== 'undefined') {
                        if( typeof opcodes[op] !== 'undefined') {
                            if(opcodes[op] !== null)
                                words = [opcodes[op]];
                            else
                                words = [];
                            operand = 0;

                            if(words[0] > 0xf) {
                                operand++;
                            }

                            for( i = 0; i < args.length; i++) {
                                parse(args[i]);
                            }

                            var preAddr = address;
                            for( j = 0; j < words.length; j++) {
                                cpu.mem[address++] = words[j];
                            }
                            var postAddr = address;

                            for( i = preAddr; i <= postAddr; i++) {
                                this.addressMap[i] = this.instruction;
                            }
                        } else {
                            throw new Error('Invalid opcode (' + op + ')');
                        }
                    }
                }

                for( i = 0; i < subroutineQueue.length; i++) {
                    sr = subroutineQueue[i];
                    if( typeof serialized.subroutines[sr.id.toLowerCase()] === 'number') {
                        var value = this.addressMap.indexOf(serialized.subroutines[sr.id.toLowerCase()]);
                        if(value === -1) value = address;
                        cpu.mem[sr.address] = value;
                    } else {
                        throw new Error('Label ' + sr.id + ' was not defined (address ' + sr.address + ')');
                    }
                }
            }
        };

        return Assembler;
    }());

    if( typeof module !== 'undefined' && module.exports) {
        module.exports = DCPU16;
    }
})();
