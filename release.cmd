@echo off
set VER=1.2.1

sed -i -E "s/version>.+?</version>%VER%</" install.rdf
sed -i -E "s/version>.+?</version>%VER%</; s/download\/.+?\/greedy-cache-.+?\.xpi/download\/%VER%\/greedy-cache-%VER%\.xpi/" update.xml

set XPI=greedy-cache-%VER%.xpi
if exist %XPI% del %XPI%
zip -r9q %XPI% * -x .git/* .gitignore update.xml LICENSE README.md *.cmd *.xpi *.exe
