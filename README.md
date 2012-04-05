# DCPU-16 Emulator #
This will be a web-based DCPU-16 emulator, from Mojang's new game [0x10c](http://0x10c.com/).

I am following the [spec](http://0x10c.com/doc/dcpu-16.txt) posted by Notch.

You should be able to use the app here: [http://mappum.github.com/DCPU-16](http://mappum.github.com/DCPU-16).

## Progress ##
So far, this app can compile code, but it's possible there are mistakes. Notch's example code compiles and runs correctly. I have not yet tested this very thoroughly, so if you find anything, feel free to open a ticket.

## IMPORTANT NOTE ##
The current UI is just for getting the emulator code to work. I will try to make a real editor soon.

## Non-standard Instructions ##
Because Notch hasn't yet released a spec for I/O, I have added some instructions of my own.

* PRT a - Prints a character with the ASCII value 'a' to stdout
* GET a - Gets the next character from stdin and writes to address 'a' (registers not supported). If the buffer is empty, we get 0.
* BRK - Breaks execution (useful for debugging or program end)
