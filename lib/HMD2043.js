(function(root){
	var errors = {
    	'NONE': 0,
    	'NO_MEDIA': 1,
    	'INVALID_SECTOR': 2,
    	'PENDING': 3
    };
    
	function HMD2043(cpu) {
		this.cpu = cpu;
		
		this.media;
		this.sector = 0;
		
		this.fullStroke = 200;
		this.spindleSpeed = 300;
		this.maxTransfer = 786432;
		this.busy = false;
		
		this.nonBlocking = false;
		this.interrupts = false;
		
		this.lastInterrupt = 0;
		this.lastError = 0;
		
		this.id = 0x74fa4cae;
    	this.version = 0x07c2;
    	this.manufacturer = 0x21544948;
		
		this.interruptMessage = 0xffff;
		
		this.cpu.addDevice(this);
	};
    
    HMD2043.prototype.error = function(error) {
    	var error = errors[error];
    	if(!this.nonBlocking) this.cpu.mem.a = error;
    	else this.lastError = error;
    };
    
    HMD2043.prototype.insert = function(media) {
    	if(!this.media) {
	    	this.media = media;
	    	if(this.interrupts) {
	    		this.cpu.interrupt(this.interruptMessage);
	    	}
    	}
    };
    
    HMD2043.prototype.eject = function() {
    	if(this.media) {
	    	this.media = undefined;
	    	if(this.interrupts) {
	    		this.cpu.interrupt(this.interruptMessage);
	    	}
    	}
    };
    
    HMD2043.prototype.getSeekTime = function(sector) {    	
    	return Math.floor(Math.abs(sector - this.sector) / this.media.sectorsPerTrack)
    		* this.fullStroke / (this.media.tracks - 1);
    };
    
    HMD2043.prototype.getRWTime = function() {
    	return 1 / (this.spindleSpeed * this.media.sectorsPerTrack);
    };
    
    HMD2043.prototype.onInterrupt = function(callback) {
    	this.error('NONE');
    	
    	if(!this.busy) {
	    	switch(this.cpu.mem.a) {
	    		// QUERY_MEDIA_PRESENT
	    		case 0x0:
	    			if(this.media) this.cpu.mem.b = 1;
	    			else this.cpu.mem.b = 0;
	    			break;
	    		
	    		// QUERY_MEDIA_PARAMETERS
	    		case 0x1:
	    			if(this.media) {
		    			this.cpu.mem.b = this.media.wordsPerSector;
		    			this.cpu.mem.c = this.media.sectors;
		    			this.cpu.mem.x = (this.media.writeLocked * 1);
	    			} else {
	    				this.error('NO_MEDIA');
	    			}
	    			break;
	    			
	    		// QUERY_DEVICE_FLAGS
	    		case 0x2:
	    			switch(this.cpu.mem.b) {
	    				// NON_BLOCKING 
	    				case 0:
	    					this.cpu.mem.b = this.nonBlocking * 1;
	    					break;
	    				
	    				// MEDIA_STATUS_INTERRUPT  
	    				case 1:
	    					this.cpu.mem.b = this.interrupts * 1;
	    					break;
	    			}
	    			break;
	    			
	    		// UPDATE_DEVICE_FLAGS
	    		case 0x3:
	    			switch(this.cpu.mem.b) {
	    				// NON_BLOCKING 
	    				case 0:
	    					this.nonBlocking = (this.cpu.mem.b !== 0);
	    					break;
	    				
	    				// MEDIA_STATUS_INTERRUPT  
	    				case 1:
	    					this.interrupts = (this.cpu.mem.b !== 0);
	    					break;
	    			}
	    			break;
	    			
	    		// QUERY_INTERRUPT_TYPE
	    		case 0x4:
	    			this.cpu.mem.b = this.lastInterrupt;
	    			this.cpu.mem.a = this.lastError;
	    			break;
	    			
	    		// SET_INTERRUPT_MESSAGE
	    		case 0x5:
	    			this.interruptMessage = this.cpu.mem.b;
	    			break;
	    			
	    		// READ_SECTORS
	    		case 0x10:
	    			accessDisk(true, callback);
	    			return;
	    			
	    		// WRITE_SECTORS
	    		case 0x11:
	    			accessDisk(false, callback);
	    			return;
	    			
	    		// QUERY_MEDIA_QUALITY
	    		case 0xffff:
	    			if(this.media) this.cpu.mem.b = this.media.quality;
	    			else this.error('NO_MEDIA');
	    			break;
	    	}
    	} else {
	    	this.error('PENDING');
	    }
    	callback();
    };
    
    function accessDisk(read, callback) {
    	if(this.media.writeProtected && !read) return;
    	
    	if(this.media) {
	    	var sector = this.cpu.mem.b;
	    			
	    	if(this.media.data[sector]) {
	    	var length = this.cpu.mem.c;
	    	var buffer = this.cpu.mem.x;
	    		
		    var seekTime = this.getSeekTime(track, sector);
		    var rwTime = this.getRWTime() * length;
		    			
		    var data = this.media.data.slice(sector, sector + length + 1);
		    		
		    if(this.nonBlocking) {
		    	callback();
		    }
		    			
		    setTimeout(function() {
		    	var offset = 0;
		    	for(var i = 0; i < data.length; i++) {
		    		for(var j = 0; j < data[i].length; j++) {
		    			if(read) this.cpu.mem[buffer + offset] = data[i][j];
		    			else data[i][j] = this.cpu.mem[buffer + offset];
		    			offset++;
		    		}
		    	}
		    				
				this.sector = sector;
			  	this.busy = false;
				    		
		    	if(!this.nonBlocking) callback();
			}, seekTime + rwTime);
			    		
			   this.busy = true;
		    return;
		    } else {
		    	this.error('INVALID_SECTOR');
		    }
	    } else {
	    	this.error('NO_MEDIA');
	    }
    };
    
	if (typeof module === 'undefined') {
	    (root.DCPU16 = (root.DCPU16 || {})).HMD2043 = HMD2043;
	} else {
	    module.exports = HMD2043;
	}
    
})(this);
