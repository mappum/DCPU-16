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

function getSigned(word) {
	var sign = word >> 15;
	var value = word & 0x7fff;
	
	return value + (sign * -0xffff);
}

var OPCODES = {
    //assembler directives
    'DAT': null,

    //basic ops
    'SET': 0x01,
    'ADD': 0x02,
    'SUB': 0x03,
    'MUL': 0x04,
    'MLI': 0x05,
    'DIV': 0x06,
    'DVI': 0x07,
    'MOD': 0x08,
    'AND': 0x09,
    'BOR': 0x0a,
    'XOR': 0x0b,
    'SHR': 0x0c,
    'ASR': 0x0d,
    'SHL': 0x0e,
    'IFB': 0x10,
    'IFC': 0x11,
    'IFE': 0x12,
    'IFN': 0x13,
    'IFG': 0x14,
    'IFA': 0x15,
    'IFL': 0x16,
    'IFU': 0x17,

    //non-basic ops
    'JSR': 0x20,
    'BRK': 0x40,
    'INT': 0x100,
    'ING': 0x120,
    'INS': 0x140,
    'HWN': 0x200,
    'HWQ': 0x220,
    'HWI': 0x240
};

var OPCODE_COST = [
    // Basic opcodes
    1,
    2, 2, 2, 2,
    3, 3, 3,
    1, 1, 1,
    2, 2, 2,
    null,
    2, 2, 2, 2, 2, 2, 2, 2,

    // Non-basic opcodes
    null,
    3,
    null, null, null, null, null, null,
    4, 1, 1,
    null, null, null, null, null,
    2, 4, 4,
    null, null, null, null, null, null, null, null, null, null, null, null, null
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

    // device list
    this._devices = [];

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

        if((word & 0x1f) === 0) {
            return {
            	opcode: word & 0x3ff,
            	a: this.addressFor((word & 0xfc00) >> 10)
            };
        } else {
        	return {
        		opcode: word & 0x1f,
        		b: this.addressFor((word & 0x3e0) >> 5),
        		a: this.addressFor((word & 0xfc00) >> 10)
        	};
        }
    },

    // Returns the memory address at which the value resides.
    addressFor: function(value, a) {
        var r, address;
        // Handle the simple register cases first
        if(value <= 0x17 || value === 0x1a) {
            r = REGISTER_NAMES[value % 8] || 'stack';
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
            return (value - 0x21) | FLAG_LITERAL;
        }

        // Other kinds of values
        switch(value) {
            // stack pointer
            case 0x18:
            	if(a) {
	                var pre = this.get('stack');
	                this.set('stack', pre + 1);
	                return pre;
            	} else {
	                var output = this.get('stack') - 1;
	                this.set('stack', output);
	                return output;
            	}
            case 0x19:
                return this.get('stack');

            // other registers
            case 0x1b:
                return 'stack';
            case 0x1c:
                return 'pc';
            case 0x1d:
                return 'ex';

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
        if (typeof key === 'number') {
            // If the key is flagged as a literal, return the value immediately.
            if (key & FLAG_LITERAL) return key & this.maxValue;
            key &= this.maxValue;
        }

        return this.mem[key];
    },
    // Assigns 'value' into the memory location referenced by 'key'
    set: function(key, value) {
        if (typeof key === 'number') {
            // If the key is flagged as a literal, don't set.
            if (key & FLAG_LITERAL) return;
            key &= this.maxValue;
        }
        value &= this.maxValue;

        this.mem[key] = value;
    },
    step: function() {    	
        var insn, aVal, aRaw, bVal, result;

        // Fetch the instruction
        insn = this.nextInstruction();
        this.cycle += OPCODE_COST[insn.opcode] || 0;

        // Read the arguments
        if(insn.opcode !== 0) {
            bVal = this.get(insn.b);
        }
        aVal = this.get(insn.a);

        switch (insn.opcode) {
            // SET
            case 0x1:
                this.set(insn.b, aVal);
                break;

            // ADD
            case 0x2:
                result = bVal + aVal;
                this.set(insn.b, result);
                this.set('ex', (result > this.maxValue) ? 0x0001 : 0x0000);
                break;

            // SUB
            case 0x3:
                result = bVal - aVal;
                this.set(insn.b, result);
                this.set('ex', (result < 0) ? this.maxValue : 0x0000);
                break;

            // MUL
            case 0x4:
                result = bVal * aVal;
                this.set(insn.b, result);
                this.set('ex', result >> 16);
                break;
                
            // MLI
           	case 0x5:
           		result = getSigned(bVal) * getSigned(aVal);
                this.set(insn.b, result);
                this.set('ex', result >> 16);
                break;

            // DIV
            case 0x6:
                if(aVal === 0) {
                    this.set(insn.b, 0x0000);
                    this.set('ex', 0x0000);
                } else {
                    this.set(inan.b, Math.floor(bVal / aVal));
                    this.set('ex', (bVal << 16) / aVal);
                }
                break;
			     
			// DVI
           	case 0x7:
                if(aVal === 0) {
                    this.set(insn.b, 0x0000);
                    this.set('ex', 0x0000);
                } else {
                    this.set(inan.b, Math.floor(getSigned(bVal) / getSigned(aVal)));
                    this.set('ex', (getSigned(bVal) << 16) / getSigned(aVal));
                }
                break;
           
            // MOD
            case 0x8:
                this.set(insn.b, (aVal === 0) ? 0x0000 : bVal % aVal);
                break;
           		
            // AND
            case 0x9:
                this.set(insn.b, bVal & aVal);
                break;

            // BOR
            case 0xa:
                this.set(insn.b, bVal | aVal);
                break;

            // XOR
            case 0xb:
                this.set(insn.b, bVal ^ aVal);
                break;

            // SHR
            case 0xc:
                this.set(insn.b, bVal >>> aVal);
                this.set('ex', (bVal << 16) >> aVal);
                break;
            
            // ASR
            case 0xd:
            	this.set(insn.b, bVal >> getSigned(aVal));
            	this.set('ex', (bVal << 16) >>> aVal);
            	break;
                
            // SHL
            case 0xe:
                this.set(insn.b, bVal << aVal);
                this.set('ex', (bVal << aVal) >> 16);
                break;

            // IFB
            case 0x10:
                if((bVal & aVal) === 0) {
                    this.nextInstruction(); // skip
                    this.cycle += 1;
                }
                break;
            
            // IFC
            case 0x11:
            	if(bVal & aVal) {
                    this.nextInstruction(); // skip
                    this.cycle += 1;
                }
            	break;
               
            // IFE
            case 0x12:
                if(bVal !== aVal) {
                    this.nextInstruction(); // skip
                    this.cycle += 1;
                }
                break;

            // IFN
            case 0x13:
                if(bVal === aVal) {
                    this.nextInstruction(); // skip
                    this.cycle += 1;
                }
                break;

            // IFG
            case 0x14:
                if(bVal <= aVal) {
                    this.nextInstruction(); // skip
                    this.cycle += 1;
                }
                break;
            
            // IFA
            case 0x15:
            	if(getSigned(bVal) <= getSigned(aVal)) {
                    this.nextInstruction(); // skip
                    this.cycle += 1;
                }
            	break;
            
            // IFL
            case 0x16:
            	if(bVal >= aVal) {
                    this.nextInstruction(); // skip
                    this.cycle += 1;
                }
            	break;
            
            // IFU
            case 0x17:
            	if(getSigned(bVal) >= getSigned(aVal)) {
                    this.nextInstruction(); // skip
                    this.cycle += 1;
                }
            	break;

            // JSR
            case 0x20:
                var stack = (this.get('stack') - 1) & this.maxValue;
                this.set('stack', stack);
                this.set(stack, this.get('pc'));
                this.set('pc', bVal);
                break;

            // BRK (non-standard)
            case 0x40:
                this.stop();
                break;
            
            // INT
            case 0x100:
		    	if(this.mem.ia !== 0) {
		    		this.set('push', this.mem.pc);
		    		this.set('push', this.mem.a);
		    		this.set('pc', this.mem.ia);
		    		this.set('a', aVal);
		    	}
            	break;
            
            // ING
            case 0x120:
            	this.set(this.mem[aVal], this.mem.ia);
            	break;
            
            // INS
            case 0x140:
		    	this.set('ia', aVal);
            	break;
            
            // HWN
            case 0x200:
            	this.set(instr.a, this._devices.length);
            	break;
            
            // HWQ
            case 0x220:
            	if(this._devices[aVal]) {
            		this.set('a', this._devices[aVal].type >> 16);
            		this.set('b', this._devices[aVal].type & 0xff);
            		this.set('c', this._devices[aVal].revision);
            		this.set('x', this._devices[aVal].manufacturer >> 16);
            		this.set('y', this._devices[aVal].manufacturer & 0xff);
            	} else {
            		this.set('a', 0);
            		this.set('b', 0);
            		this.set('c', 0);
            		this.set('x', 0);
            		this.set('y', 0);
            	}
            	break;
            
            // HWI
            case 0x240:
            	if(this._devices[aVal] && this._devices[aVal].onInterrupt) {
            		this._devices[aVal].onInterrupt();
            	}
            	break;

            default:
                throw new Error('Encountered invalid opcode 0x' + insn.opcode.toString(16));
        }
    },
    load: function(binary, origin) {
        if (!origin || typeof origin !== "number") {
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
        this.mem.ex = 0;
        this.mem.ia = 0;
        this.cycle = 0;

        this.running = false;

        this.timer = 0;
    },
    addDevice: function(device) {
    	if(device && this._devices.length < 65536
    	&& typeof device.type !== 'undefined'
    	&& typeof device.revision !== 'undefined'
    	&& typeof device.manufacturer !== 'undefined')
        	this._devices.push(device);
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
