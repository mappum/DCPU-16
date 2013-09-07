# DCPU-16 Emulator #
This will be a web-based DCPU-16 emulator, from Mojang's new game [0x10c](http://0x10c.com/).

I am following the [spec](http://0x10c.com/doc/dcpu-16.txt) posted by Notch.

You should be able to use the app here: [http://mappum.github.com/DCPU-16](http://mappum.github.com/DCPU-16).

## Contributors ##
@Twisol has spent a good deal of time cleaning up my messy code and adding some of his own. Thank you!

## Progress ##
Both the compiler and the VM are working effectively. Bugs are being found, but we are repairing them as fast as we can. If you stumble across a problem, something you think may be a problem, or have any suggestions, feel free to open a support ticket. If you make any modifications to share, give me a pull request.

## IMPORTANT NOTE ##
The current UI is just for getting the emulator code to work. I will try to make a real editor soon.

## Non-standard Instructions ##
Because Notch hasn't yet released a spec for I/O, I have added some instructions of my own.

* **BRK** - Breaks execution (useful for debugging or program end)

To print to the console, write an ASCII value anywhere between 0x8000 and 0x8180, where 0x8000 is the first character on the screen, 0x8001 is the second, and so on. Color isn't supported yet (but will be momentarily).

To read input from the keyboard, read from 0x7FFF to get the next character in the buffer.


## License ##

This code is licensed under the [MIT license](http://opensource.org/licenses/MIT).
