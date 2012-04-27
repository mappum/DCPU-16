(function(root){
	function HMU1440() {
		this.tracks = 80;
		this.sectorsPerTrack = 18;
		this.sectors = this.tracks * this.sectorsPerTrack;
		this.wordsPerSector = 512;
		
		this.quality = 0x7fff;
		
		this.writeProtected = false;
		
		this.data;
		this.clear();
	};
	
	HMU1440.prototype.clear = function() {
		this.data = [];
		for(var i = 0; i < this.sectors; i++) {
			this.data.push([]);
			for(var j = 0; j < this.wordsPerSector; j++) {
				this.data[i].push(0);
			}
		}
	};
    
	if (typeof module === 'undefined') {
	    (root.DCPU16 = (root.DCPU16 || {})).HMU1440 = HMU1440;
	} else {
	    module.exports = HMU1440;
	}
    
})(this);
