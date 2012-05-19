(function (root) {

"use strict";

root.formatWord = function(word) {
    if(typeof word === 'undefined') {
        return 'null';
    }

    word &= 0xFFFF;
    word = word.toString(16);
    while(word.length < 4) {
        word = '0' + word;
    }

    return word;
};

root.getSigned = function(word) {
    var sign = (word << 1)&65536; // move sign bit to bit 16
    // word-65536 for negatives (e.g. 0xffff-65536 = -1, 0x8000-65536 = -32768), word for positives
    return word-sign;
};

var opcodes = [
    //assembler directives
    {id: 'DAT', cost: 0, args: Infinity},
    {id: '.ORG', cost: 0, args: 1},
    
    //null word
    {code: 0x00, cost: 0},

    //basic ops
    {id: 'SET', code: 0x01, cost: 1, args: 2},
    {id: 'ADD', code: 0x02, cost: 2, args: 2},
    {id: 'SUB', code: 0x03, cost: 2, args: 2},
    {id: 'MUL', code: 0x04, cost: 2, args: 2},
    {id: 'MLI', code: 0x05, cost: 2, args: 2},
    {id: 'DIV', code: 0x06, cost: 3, args: 2},
    {id: 'DVI', code: 0x07, cost: 3, args: 2},
    {id: 'MOD', code: 0x08, cost: 3, args: 2},
    {id: 'MDI', code: 0x09, cost: 3, args: 2},
    {id: 'AND', code: 0x0a, cost: 1, args: 2},
    {id: 'BOR', code: 0x0b, cost: 1, args: 2},
    {id: 'XOR', code: 0x0c, cost: 1, args: 2},
    {id: 'SHR', code: 0x0d, cost: 1, args: 2},
    {id: 'ASR', code: 0x0e, cost: 1, args: 2},
    {id: 'SHL', code: 0x0f, cost: 1, args: 2},
    {id: 'IFB', code: 0x10, cost: 2, args: 2},
    {id: 'IFC', code: 0x11, cost: 2, args: 2},
    {id: 'IFE', code: 0x12, cost: 2, args: 2},
    {id: 'IFN', code: 0x13, cost: 2, args: 2},
    {id: 'IFG', code: 0x14, cost: 2, args: 2},
    {id: 'IFA', code: 0x15, cost: 2, args: 2},
    {id: 'IFL', code: 0x16, cost: 2, args: 2},
    {id: 'IFU', code: 0x17, cost: 2, args: 2},
    
    {id: 'ADX', code: 0x1a, cost: 3, args: 2},
    {id: 'SBX', code: 0x1b, cost: 3, args: 2},
    
    {id: 'STI', code: 0x1e, cost: 2, args: 2},
    {id: 'STD', code: 0x1f, cost: 2, args: 2},

    //non-basic ops
    {id: 'JSR', code: 0x20, cost: 3, args: 1},
    {id: 'BRK', code: 0x40, cost: 0, args: 0},
    
    {id: 'HCF', code: 0xe0, cost: 9, args: 1},
    {id: 'INT', code: 0x100, cost: 4, args: 1},
    {id: 'IAG', code: 0x120, cost: 1, args: 1},
    {id: 'IAS', code: 0x140, cost: 1, args: 1},
    {id: 'RFI', code: 0x160, cost: 3, args: 1},
    {id: 'IAQ', code: 0x180, cost: 2, args: 1},
    
    {id: 'HWN', code: 0x200, cost: 2, args: 1},
    {id: 'HWQ', code: 0x220, cost: 4, args: 1},
    {id: 'HWI', code: 0x240, cost: 4, args: 1}
];

root.OPCODES = {};

for(var i = 0; i < opcodes.length; i++) {
	root.OPCODES[opcodes[i].id] = opcodes[i];
	root.OPCODES[opcodes[i].code] = opcodes[i];
}

root.REGISTER_NAMES = ['a', 'b', 'c', 'x', 'y', 'z', 'i', 'j'];
root.FLAG_LITERAL = 0x10000;

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
    this.speedWindow = 4; //how much time to use for the speed average (seconds)
    this.speed = 100000; //speed in hz
    this.loopBatch = 3000; //the number of loops to execute at a time in run

	this.paused = false;

    this._stop = false;
    this._endListeners = [];
    this._getListeners = [];
    this._setListeners = [];
    
    this._interruptQueue = [];
    this._triggerInterrupts = true;

    this.clear();
};

CPU.prototype = {
    nextWord: function() {
        var pc = this.mem.pc;

        var word = this.get(pc);
        this.mem.pc = pc + 1;
        this.cycle++;

        return word;
    },

    nextInstruction: function() {
        var word = this.nextWord();

        if((word & 0x1f) === 0) {
            return {
            	opcode: word & 0x3ff,
            	a: this.addressFor((word & 0xfc00) >> 10, true)
            };
        } else {
        	return {
        		opcode: word & 0x1f,
        		a: this.addressFor((word & 0xfc00) >> 10, true),
        		b: this.addressFor((word & 0x3e0) >> 5)
        	};
        }
    },

    // Returns the memory address at which the value resides.
    addressFor: function(value, a) {
        var r, address;
        // Handle the simple register cases first
        if(value <= 0x17 || value === 0x1a) {
            r = root.REGISTER_NAMES[value % 8];
            if(value === 0x1a) r = 'sp';
            if(0x00 <= value && value <= 0x07) {
                address = r;
            } else if(0x08 <= value && value <= 0x0F) {
                address = this.mem[r];
            } else {
                address = (this.nextWord() + this.mem[r]) & 0xffff;
            }
            return address;
        }

        // Encoded literals
        if(value >= 0x20 && value <= 0x3f) {
        	var output = value - 0x21;
        	output &= this.maxValue;
            return output | root.FLAG_LITERAL;
        }

        // Other kinds of values
        switch(value) {
            // stack pointer
            case 0x18:
            	if(a) {
	                var pre = this.mem.sp;
	                this.mem.sp = pre + 1;
	                return pre;
            	} else {
	                var output = ((this.mem.sp - 1) & this.maxValue);
	                this.mem.sp = output;
	                return output;
            	}
            case 0x19:
                return this.mem.sp;

			case 0x1a:
				return (this.nextWord() + this.mem.sp) & 0xffff;

            // other registers
            case 0x1b:
                return 'sp';
            case 0x1c:
                return 'pc';
            case 0x1d:
                return 'ex';

            // extended instruction values
            case 0x1e: // as address
                return this.nextWord();
            case 0x1f: // as literal
                return this.nextWord() | root.FLAG_LITERAL;

            default:
                throw new Error('Encountered unknown argument type 0x' + value.toString(16));
        }
    },
    get: function(key) {
        if (typeof key === 'number') {
            // If the key is flagged as a literal, return the value
            if(key & root.FLAG_LITERAL) return key ^ root.FLAG_LITERAL;
            key &= this.maxValue;
        } else if(key === 'pop') {
        	key = this.mem.sp;
        	this.mem.sp = ((key + 1) & this.maxValue);
        }

		for(var i = 0; i < this._getListeners.length; i++) {
			var listener = this._getListeners[i];
			if(key >= listener.address && key < listener.address + listener.length) {
				var value = listener.callback(key - listener.address);
				if(value) return value;
			}
		}

        return this.mem[key];
    },
    // Assigns 'value' into the memory location referenced by 'key'
    set: function(key, value) {
        if (typeof key === 'number') {
            // If the key is flagged as a literal, don't set.
            if (key & root.FLAG_LITERAL) return;
            key &= this.maxValue;
        } else if(key === 'push') {
        	this.mem.sp = (this.mem.sp - 1 & this.maxValue);
            key = this.mem.sp;
        }
        value &= this.maxValue;
        
        for(var i = 0; i < this._setListeners.length; i++) {
			var listener = this._setListeners[i];
			if(key >= listener.address && key < listener.address + listener.length) {
				if(listener.callback(key - listener.address, value) === true) return;
			}
		}

        this.mem[key] = value;
    },
    skip: function() {
    	var sp = this.mem.sp;
    	this.nextInstruction();
    	this.mem.sp = sp;
    },
    skipUntilNonif: function() {
        // pc is at the instruction following our failed if, so:
        //  - skip all consecutive ifs
        //  - skip the last non-if instruction
        while((this.get(this.mem.pc) & 0x1f) >= 0x10
        && (this.get(this.mem.pc) & 0x1f) <= 0x17) {
          this.skip();
        }
        this.skip();
    },
    step: function() {
    	if(!this.paused) {
	    	if(this._triggerInterrupts && this._interruptQueue.length > 0) {
	    		this.trigger(this._interruptQueue.shift());
	    	}
	    	
	        var insn, aVal, bVal, result;
	
	        // Fetch the instruction
	        insn = this.nextInstruction();
	        if(root.OPCODES[insn.opcode] === undefined) {
	        	this.stop();
	        	this.end();
	        	throw new Error('Encountered invalid opcode 0x' + insn.opcode.toString(16));
	        }
	        
	        this.cycle += (root.OPCODES[insn.opcode].cost - 1) || 0;
	        
	        // Read the arguments
	        aVal = this.get(insn.a);
	        if(insn.opcode !== 0) {
	            bVal = this.get(insn.b);
	        }
	
	        switch (insn.opcode) {
	        	// null
	        	case 0x0:
	        		this.stop();
	        		break;        	
	        	
	            // SET
	            case 0x1:
	                this.set(insn.b, aVal);
	                break;
	
	            // ADD
	            case 0x2:
	                result = bVal + aVal;
	                this.set('ex', (result > this.maxValue) ? 0x0001 : 0x0000);
	                this.set(insn.b, result);
	                break;
	
	            // SUB
	            case 0x3:
	                result = bVal - aVal;
	                this.set('ex', (result < 0) ? this.maxValue : 0x0000);
	                this.set(insn.b, result);
	                break;
	
	            // MUL
	            case 0x4:
	                result = bVal * aVal;
	                this.set('ex', result >> 16);
	                this.set(insn.b, result);
	                break;
	                
	            // MLI
	           	case 0x5:
	           		result = root.getSigned(bVal) * root.getSigned(aVal);
	                this.set('ex', result >> 16);
	                this.set(insn.b, result);
	                break;
	
	            // DIV
	            case 0x6:
	                if(aVal === 0) {
	                    this.set(insn.b, 0x0000);
	                    this.set('ex', 0x0000);
	                } else {
	                    this.set('ex', (bVal << 16) / aVal);
	                    this.set(insn.b, Math.floor(bVal / aVal));
	                }
	                break;
				     
				// DVI
	           	case 0x7:
	                if(aVal === 0) {
	                    this.set(insn.b, 0x0000);
	                    this.set('ex', 0x0000);
	                } else {
	                    this.set('ex', (root.getSigned(bVal) << 16) / root.getSigned(aVal));
	                    this.set(insn.b, Math.floor(root.getSigned(bVal) / root.getSigned(aVal)));
	                }
	                break;
	           
	            // MOD
	            case 0x8:
	                this.set(insn.b, (aVal === 0) ? 0x0000 : bVal % aVal);
	                break;
	                
	            // MDI
	            case 0x9:
	            	this.set(insn.b, (aVal === 0) ? 0x0000 : root.getSigned(bVal) % root.getSigned(aVal));
	            	break;
	           		
	            // AND
	            case 0xa:
	                this.set(insn.b, bVal & aVal);
	                break;
	
	            // BOR
	            case 0xb:
	                this.set(insn.b, bVal | aVal);
	                break;
	
	            // XOR
	            case 0xc:
	                this.set(insn.b, bVal ^ aVal);
	                break;
	
	            // SHR
	            case 0xd:
	                this.set('ex', (bVal << 16) >> aVal);
	                this.set(insn.b, bVal >>> aVal);
	                break;
	            
	            // ASR
	            case 0xe:
	                this.set('ex', (root.getSigned(bVal) << 16) >>> aVal);
	                this.set(insn.b, root.getSigned(bVal) >> aVal);
	                break;
	                
	            // SHL
	            case 0xf:
	                this.set('ex', (bVal << aVal) >> 16);
	                this.set(insn.b, bVal << aVal);
	                break;
	
	            // IFB
	            case 0x10:
	                if((bVal & aVal) === 0) {
	                    this.skipUntilNonif();
	                    this.cycle += 1;
	                }
	                break;
	            
	            // IFC
	            case 0x11:
	            	if(bVal & aVal) {
	            		this.skipUntilNonif();
	                    this.cycle += 1;
	                }
	            	break;
	               
	            // IFE
	            case 0x12:
	                if(bVal !== aVal) {
	                    this.skipUntilNonif();
	                    this.cycle += 1;
	                }
	                break;
	
	            // IFN
	            case 0x13:
	                if(bVal === aVal) {
	                    this.skipUntilNonif();
	                    this.cycle += 1;
	                }
	                break;
	
	            // IFG
	            case 0x14:
	                if(bVal <= aVal) {
	                    this.skipUntilNonif();
	                    this.cycle += 1;
	                }
	                break;
	            
	            // IFA
	            case 0x15:
	            	if(root.getSigned(bVal) <= root.getSigned(aVal)) {
	                    this.skipUntilNonif();
	                    this.cycle += 1;
	                }
	            	break;
	            
	            // IFL
	            case 0x16:
	            	if(bVal >= aVal) {
	                    this.skipUntilNonif();
	                    this.cycle += 1;
	                }
	            	break;
	            
	            // IFU
	            case 0x17:
	            	if(root.getSigned(bVal) >= root.getSigned(aVal)) {
	            		this.skipUntilNonif();
	                    this.cycle += 1;
	                }
	            	break;
	            	
	            // ADX
	            case 0x1a:
	            	var value = bVal + aVal + this.mem.ex;
	            	if(value > this.maxValue) this.mem.ex = 1;
	            	else this.mem.ex = 0;
	            	this.set(insn.b, value);
	            	break;
	            	
	            // SBX
	            case 0x1b:
	            	var value = bVal - aVal + this.mem.ex;
	            	if(value < 0) this.set('ex', 0xffff);
	            	else this.set('ex', 1);
	            	this.set(insn.b, value);
	            	break;
	                
	            // STI
	            case 0x1e:
	            	this.set(insn.b, aVal);
	            	this.set('i', this.get('i') + 1);
	            	this.set('j', this.get('j') + 1);
	            	break;
	                
	            // STD
	            case 0x1f:
	            	this.set(insn.b, aVal);
	            	this.set('i', this.get('i') - 1);
	            	this.set('j', this.get('j') - 1);
	            	break;
	
	            // JSR
	            case 0x20:
	            	this.set('push', this.get('pc'));
	                this.set('pc', aVal);
	                break;
	
	            // BRK (non-standard)
	            case 0x40:
	                this.stop();
	                break;
	                
	            // HCF
	            case 0xe0:
	            	this.stop();
	            	this.end();
	            	this.clear();
	            	break;
	            
	            // INT
	            case 0x100:
			    	this.interrupt(aVal);
	            	break;
	            
	            // IAG
	            case 0x120:
	            	this.set(this.get(aVal), this.mem.ia);
	            	break;
	            
	            // IAS
	            case 0x140:
			    	this.set('ia', aVal);
	            	break;
	            
	            // RFI
	            case 0x160:
	            	this._triggerInterrupts = true;
	            	this.set('a', this.get('pop'));
	            	this.set('pc', this.get('pop'));
	            	break;
	            
	            // IAQ
	            case 0x180:
			    	if(aVal) this._triggerInterrupts = false;
			    	else this._triggerInterrupts = true;
	            	break;
	            
	            // HWN
	            case 0x200:
	            	this.set(insn.a, this._devices.length);
	            	break;
	            
	            // HWQ
	            case 0x220:
	            	if(this._devices[aVal]) {
	            		this.mem.b = (this._devices[aVal].id >> 16);
	            		this.mem.a = (this._devices[aVal].id & 0xffff);
	            		this.mem.c = this._devices[aVal].version;
	            		this.mem.y = (this._devices[aVal].manufacturer >> 16);
	            		this.mem.x = (this._devices[aVal].manufacturer & 0xffff);
	            	} else {
	            		this.mem.b = 0;
	            		this.mem.a = 0;
	            		this.mem.c = 0;
	            		this.mem.y = 0;
	            		this.mem.x = 0;
	            	}
	            	break;
	            
	            // HWI
	            case 0x240:
	            	if(this._devices[aVal] && this._devices[aVal].onInterrupt) {
	            		this.paused = this._devices[aVal].onInterrupt(function(){ this.paused = false; }.bind(this));
	            	}
	            	break;
	        }
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
        for( _len = root.REGISTER_NAMES.length; i < _len; ++i) {
            this.set(root.REGISTER_NAMES[i], 0);
        }
        for( i = 0, _len = this.ramSize; i < _len; ++i) {
            this.set(i, 0);
        }

        this.mem.pc = 0;
        this.mem.sp = 0;
        this.mem.ex = 0;
        this.mem.ia = 0;
        this.cycle = 0;
        
        this._interruptQueue = [];
    	this._triggerInterrupts = true;

        this.running = false;

        this.timer = 0;
    },
    addDevice: function(device) {
    	if(device && this._devices.length < 65536
    	&& typeof device.id !== 'undefined'
    	&& typeof device.version !== 'undefined'
    	&& typeof device.manufacturer !== 'undefined')
        	this._devices.push(device);
    },
    interrupt: function(message) {
    	this.cycle += 4;
    	
    	if(!this.triggerInterrupts) {
    		this._interruptQueue.push(message);
    	} else {
	    	if(this.mem.ia !== 0) {
	    		this.trigger(message);
			}
		}
    },
    trigger: function(message) {
    	this._triggerInterrupts = false;
	    this.set('push', this.mem.pc);
	    this.set('push', this.mem.a);
	    this.set('pc', this.mem.ia);
	    this.set('a', message);
    },
    end: function() {
        for(var i = 0; i < this._endListeners.length; i++) {
            this._endListeners[i]();
        }
        this._stop = false;
        this.running = false;
    },
    //EVENT LISTENER REGISTRATION
    onEnd: function(callback) {
        this._endListeners.push(callback);
    },
    onGet: function(address, length, callback) {
    	if(typeof length === 'function') {
    		callback = length;
    		length = 1;
    	}
    	
    	var listener = {
        	address: address,
        	length: length,
        	callback: callback
        };
        this._getListeners.push(listener);
        return listener;
    },
    onSet: function(address, length, callback) {
    	if(typeof length === 'function') {
    		callback = length;
    		length = 1;
    	}
    	
        var listener = {
        	address: address,
        	length: length,
        	callback: callback
        };
        this._setListeners.push(listener);
        return listener;
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
        output += 'SP: ' + formatWord(this.mem.sp) + '\n';
        output += 'EX: ' + formatWord(this.mem.ex) + '\n';
        output += 'IA: ' + formatWord(this.mem.ia) + '\n\n';
        output += 'CPU CYCLES: ' + this.cycle + '\n\n';
        output += '======= RAM: =======';
        for( i = 0; i < this.ramSize; i += 8) {
            populated = false;
            for( j = 0; j < 8; j++) {
                if(this.get(i + j) || this.mem.pc === i + j || this.mem.sp === i + j) {
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
                    } else if(this.mem.sp === i + j) {
                        output += '*';
                    } else if(this.mem.sp === i + j - 1) {
                        output += '*';
                    } else {
                        output += ' ';
                    }
                    output += formatWord(this.get(i + j));
                }
            }
        }

        return output;
    }
};

CPU.FLAG_LITERAL = root.FLAG_LITERAL;
CPU.REGISTER_NAMES = root.REGISTER_NAMES;
CPU.OPCODES = root.OPCODES;

CPU.formatWord = root.formatWord;
CPU.getSigned = root.getSigned;

if (typeof module === 'undefined') {
    (root.DCPU16 = (root.DCPU16 || {})).CPU = CPU;
} else {
    module.exports = CPU;
}

})(this);
