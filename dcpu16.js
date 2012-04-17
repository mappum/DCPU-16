/*
Copyright (c) 2012 Matt Bell

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// namespace
(function() {'use strict';
    var DCPU16 = {};

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

    DCPU16.opcodeCost = [
        // Basic opcodes
        0,          // Set
        1, 1, 1,    // +, -, *
        2, 2,       // %, /
        1, 1,       // Shift
        0, 0, 0,    // Boolean
        1, 1, 1, 1, // Conditional

        // Non-basic opcodes
        null, // Reserved
        1,    // JSR
        0     // BRK (non-standard)
    ];

    DCPU16.registerNames = ['a', 'b', 'c', 'x', 'y', 'z', 'i', 'j'];

    DCPU16.CPU = ( function() {
        var opcodeCost = DCPU16.opcodeCost,
            registerNames = DCPU16.registerNames;

        var FLAG_LITERAL = 0x10000;

        var CPU = function CPU() {
            // Memory storage
            this.mem = [];
            this.ramSize = 0x10000;
            //ram size in words
            this.wordSize = 2;
            //word size in bytes
            this.maxValue = Math.pow(2, this.wordSize * 8) - 1;
            //max value of words
            this.mem.length = this.ramSize;

            // Device layer
            this._devices = [];
            this._devices.length = this.ramSize;

            // Execution parameters
            this.throttled = true; //whether or not to control speed
            this.speedScale = 14; //how fast to auto-adjust execution speed
           						   // (higher means smoother speeds, lower means more accuracy)

            this.speed = 100000; //speed in hz
            this.loopBatch = 1600; //the number of loops to execute at a time in run


            this._stop = false;
            this._endListeners = [];

            this.clear();
        };

        CPU.prototype = {
            FLAG_LITERAL: FLAG_LITERAL,

            nextWord: function() {
                var pc = this.get('pc');

                var word = this.get(pc);
                this.set('pc', pc + 1);
                this.cycle++;

                return word;
            },

            nextInstruction: function() {
                var word = this.nextWord();

                // Map all opcodes into a single continuous enumeration
                var opcode = word & 0xF;
                if (opcode === 0) {
                    word >>= 4;
                    opcode = (word & 0x3F) + 15;
                } else {
                    opcode -= 1;
                }

                // Deal with each form of instruction
                if (opcode >= 15) {
                // non-basic instruction
                    return {
                        opcode: opcode,
                        a: this.addressFor((word >> 6) & 0x3F)
                    };
                } else {
                // basic instruction
                    return {
                        opcode: opcode,
                        a: this.addressFor((word >> 4)  & 0x3F),
                        b: this.addressFor((word >> 10) & 0x3F)
                    };
                }
            },

            // Returns the memory address at which the value resides.
            addressFor: function(value) {
                var r, address;
                // Handle the simple register cases first
                if(value <= 0x17) {
                    r = registerNames[value % 8];
                    if(0x00 <= value && value <= 0x07) {
                        address = r;
                    } else if(0x08 <= value && value <= 0x0F) {
                        address = this.get(r);
                    } else {
                        address = (this.nextWord() + this.get(r)) & 0xffff;
                    }
                    return address;
                }

                // Encoded literals
                if(value >= 0x20 && value <= 0x3f) {
                    return (value - 0x20) | FLAG_LITERAL;
                }

                // Other kinds of values
                switch(value) {
                    // stack pointer
                    case 0x18:
                        var pre = this.get('stack');
                        this.set('stack', pre + 1);
                        return pre;
                    case 0x19:
                        return this.get('stack');
                    case 0x1a:
                        var output = this.get('stack') - 1;
                        this.set('stack', output);
                        return output;

                    // other registers
                    case 0x1b:
                        return 'stack';
                    case 0x1c:
                        return 'pc';
                    case 0x1d:
                        return 'o';

                    // extended instruction values
                    case 0x1e: // as address
                        return this.nextWord();
                    case 0x1f: // as literal
                        return this.nextWord() | FLAG_LITERAL;

                    default:
                        throw new Error('Encountered unknown argument type 0x' + value.toString(16));
                }
            },
            get: function(key) {
                if (typeof key === "number") {
                    // If the key is flagged as a literal, return the value immediately.
                    if (key & FLAG_LITERAL) return key & this.maxValue;
                    key &= this.maxValue;
                }

                var device = this.getDevice(key);
                if(device && device.onGet) {
                    return device.onGet(key - device.start) & this.maxValue;
                } else {
                    return this.mem[key];
                }
            },
            // Assigns 'value' into the memory location referenced by 'key'
            set: function(key, value) {
                if (typeof key === "number") {
                    // If the key is flagged as a literal, don't set.
                    if (key & FLAG_LITERAL) return;
                    key &= this.maxValue;
                }
                value &= this.maxValue;

                var device = this.getDevice(key);
                if(device && device.onSet) {
                    device.onSet(key - device.start, value);
                } else {
                    this.mem[key] = value;
                }
            },
            step: function() {
                var insn, aVal, aRaw, bVal, result;

                // Fetch the instruction
                insn = this.nextInstruction();
                this.cycle += opcodeCost[insn.opcode] || 0;

                // Read the arguments
                if (insn.opcode !== 0)
                    aVal = this.get(insn.a);
                if (insn.opcode < 15)
                    bVal = this.get(insn.b);

                switch (insn.opcode) {
                    // SET
                    case 0:
                        this.set(insn.a, bVal);
                        break;

                    // ADD
                    case 1:
                        result = aVal + bVal;
                        this.set(insn.a, result);
                        this.set('o', (result > this.maxValue) ? 0x0001 : 0x0000);
                        break;

                    // SUB
                    case 2:
                        result = aVal - bVal;
                        this.set(insn.a, result);
                        this.set('o', (result < 0) ? this.maxValue : 0x0000);
                        break;

                    // MUL
                    case 3:
                        result = aVal * bVal;
                        this.set(insn.a, result);
                        this.set('o', result >> 16);
                        break;

                    // DIV
                    case 4:
                        if(bVal === 0) {
                            this.set(insn.a, 0x0000);
                            this.set('o', 0x0000);
                        } else {
                            this.set(inan.a, Math.floor(aVal / bVal));
                            this.set('o', (aVal << 16) / bVal);
                        }
                        break;

                    // MOD
                    case 5:
                        this.set(insn.a, (bVal === 0) ? 0x0000 : aVal % bVal);
                        break;

                    // SHL
                    case 6:
                        this.set(insn.a, aVal << bVal);
                        this.set('o', (aVal << bVal) >> 16);
                        break;

                    // SHR
                    case 7:
                        this.set(insn.a, aVal >> bVal);
                        this.set('o', (aVal << 16) >> bVal);
                        break;

                    // AND
                    case 8:
                        this.set(insn.a, aVal & bVal);
                        break;

                    // BOR
                    case 9:
                        this.set(insn.a, aVal | bVal);
                        break;

                    // XOR
                    case 10:
                        this.set(insn.a, aVal ^ bVal);
                        break;

                    // IFE
                    case 11:
                        if(aVal !== bVal) {
                            this.nextInstruction(); // skip
                            this.cycle += 1;
                        }
                        break;

                    // IFN
                    case 12:
                        if(aVal === bVal) {
                            this.nextInstruction(); // skip
                            this.cycle += 1;
                        }
                        break;

                    // IFG
                    case 13:
                        if(aVal <= bVal) {
                            this.nextInstruction(); // skip
                            this.cycle += 1;
                        }
                        break;

                    // IFB
                    case 14:
                        if((aVal & bVal) === 0) {
                            this.nextInstruction(); // skip
                            this.cycle += 1;
                        }
                        break;

                    /* // Reserved
                    case 15:
                        break;
                    */

                    // JSR
                    case 16:
                        var stack = (this.get('stack') - 1) & this.maxValue;
                        this.set('stack', stack);
                        this.set(stack, this.get('pc'));
                        this.set('pc', aVal);
                        break;

                    // BRK (non-standard)
                    case 17:
                        this.stop();
                        break;

                    default:
                        throw new Error('Encountered invalid opcode 0x' + insn.opcode.toString(16));
                }
            },
            load: function(binary, origin) {
                if (!origin || typeof "origin" !== "number") {
                    origin = 0x0000;
                }

                for (var i = 0; i < binary.length; ++i) {
                    this.set((origin+i) & this.maxValue, binary[i]);
                }
            },
            run: function(onLoop) {
                var $this = this, startTime = new Date().getTime();
                var stackCounter = 0;
                this.running = true;

                function loop() {
                    if(!$this._stop && $this.running) {
                    	for(var i = 0; i < $this.loopBatch; i++) {
                    		if(!$this._stop && $this.running) {
	                        	$this.step();
	                        } else if($this.running) {
		                        $this.end();
		                    }
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
                // Ensure that there's room for the device.
                for (var i = where, _len = where+length; i < _len; ++i) {
                    if (this._devices[i & this.maxValue])
                        return false;
                }

                var device = {
                    start: where,
                    end: where + length - 1,
                    onGet: callbacks.get || null,
                    onSet: callbacks.set || null
                };

                for (var i = where, _len = where+length; i < _len; ++i) {
                    this._devices[i & this.maxValue] = device;
                }

                return true;
            },
            unmapDevice: function(where) {
                var device = this._devices[where & this.maxValue];
                if (!device) return;

                for (var i = device.start, _len = device.end; i < _len; ++i) {
                    this._devices[i & this.maxValue] = undefined;
                }
            },
            getDevice: function(index) {
                return this._devices[index & this.maxValue] || null;
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
    } else {
        window['DCPU16'] = DCPU16;
    }
})();
