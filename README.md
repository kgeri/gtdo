## Building
The following tools are required for building (assuming Ubuntu 14.04):

```bash
sudo apt-get install npm nodejs-legacy
sudo npm install -g bower
sudo npm install -g bowcat
```

Then, dependencies can be updated with:

```bash
bower update
bowcat --min
```
