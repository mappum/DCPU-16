(function (root) {

"use strict";

function formatWord(word) {
    if(typeof word === 'undefined') {
        return 'null';
    }

    word &= 0xFFFF;
    word = word.toString(16);
    while(word.length < 4) {
        word = '0' + word;
    }

    return word;
}

var OPCODES = {
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

var OPCODE_COST = [
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

var REGISTER_NAMES = ['a', 'b', 'c', 'x', 'y', 'z', 'i', 'j'];
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
            r = REGISTER_NAMES[value % 8];
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
        this.cycle += OPCODE_COST[insn.opcode] || 0;

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
        for( _len = REGISTER_NAMES.length; i < _len; ++i) {
            this.mem[REGISTER_NAMES[i]] = 0;
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
        output += 'A:  ' + formatWord(this.mem.a) + '\n';
        output += 'B:  ' + formatWord(this.mem.b) + '\n';
        output += 'C:  ' + formatWord(this.mem.c) + '\n';
        output += 'X:  ' + formatWord(this.mem.x) + '\n';
        output += 'Y:  ' + formatWord(this.mem.y) + '\n';
        output += 'Z:  ' + formatWord(this.mem.z) + '\n';
        output += 'I:  ' + formatWord(this.mem.i) + '\n';
        output += 'J:  ' + formatWord(this.mem.j) + '\n\n';
        output += 'PC: ' + formatWord(this.mem.pc) + '\n';
        output += 'SP: ' + formatWord(this.mem.stack) + '\n';
        output += 'O:  ' + formatWord(this.mem.o) + '\n\n';
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
                output += '\n' + formatWord(i) + ':';

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
                    output += formatWord(this.mem[i + j]);
                }
            }
        }

        return output;
    }
};

CPU.FLAG_LITERAL = FLAG_LITERAL;
CPU.REGISTER_NAMES = REGISTER_NAMES;
CPU.OPCODES = OPCODES;
CPU.OPCODE_COST = OPCODE_COST;

if (typeof module === 'undefined') {
    (root.DCPU16 = (root.DCPU16 || {})).CPU = CPU;
} else {
    module.exports = CPU;
}

})(this);
