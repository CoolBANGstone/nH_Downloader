const http = require('http');
const fs = require('fs');
const path = require('path');
const colors = require('colors');
const request = require('request');
const readline = require('readline');
const cliProgress = require('cli-progress');
const setCookie = require('set-cookie-parser');
var finish, tmp, end, enter;
const bar1 = new cliProgress.Bar({}, cliProgress.Presets.shades_classic);
UserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:68.0) Gecko/20100101 Firefox/68.0';
var downloading, PARALLEL = 10;

http.globalAgent.maxSockets = Infinity;
var rl = readline.createInterface({
    input:process.stdin,
    output:process.stdout
});
async function exit_program() {
    rl.question('Download complete! Press enter to exit.\n', function(input) {
        process.exit(0);
    });
}
rl.on("close", function() {
    exit_program();
});

main();

function download(val) {
    if (isNaN(val = val.substr(0, 6)))
        return;
    end = true;
    //fs.mkdir(path.join('.', val), function(err) {});
    return new Promise((resolve, reject) => {
        request({uri: `https://nhentai.net/g/${val}`}, async function(error, response, body) {
            if (error || response.statusCode !== 200) {
                console.log('Error: ' + val);
                fs.rmdir(path.join('.', val), function(err) {});
                resolve(0);
                return;
            }
            //get uri
            var keyword = '<meta itemprop=\"image\" content=\"https://t.nhentai.net/galleries/';
            var index = body.indexOf(keyword) + keyword.length;
            var uri = '', cnt = '', title = '';
            while (body[index] != '/')
                uri += body[index++];
            //get pages
            index = body.indexOf(' pages</div>');
            while (body[index - 1] != '>')
                index--;
            while (body[index] != ' ')
                cnt += body[index++];
            finish = cnt = parseInt(cnt, 10);
            //get title
            keyword = '<h2>';
            index = body.indexOf(keyword) + keyword.length;
            while (body[index] != '<' || body[index + 1] != '/' || body[index + 2] != 'h')
                title += body[index++];

            var dirname = replace_str(`${title}(${val})`.replace('/', ' '));
            fs.mkdir(path.join('.', dirname), function(err) {});
            console.log(`${title} (${cnt}p) (${val})`);

            await run(cnt, uri, val, dirname);
            resolve(0);
        });
    })
}
async function download_photo(uri, filename, callback, cnt) {
    if (cnt > 5) {
        console.log(colors.red(`\nSkip ${uri}(jpg/png)`));
        callback();
        return;
    }
    if (cnt > 0)
        console.log('\n' + filename + '   Error: ' + cnt);

    request.head({url: uri + 'jpg'}, function(err, resp, body) {
        if (!err && resp.statusCode === 200)
            request({url: uri + 'jpg'}).on('error', function(err) {
                console.log(err);
                download_photo(uri, filename, callback, cnt + 1);
                return;
            }).pipe(fs.createWriteStream(filename + 'jpg')).on('close', callback);
        else
            request.head({url: uri + 'png'}, function(err, resp, body) {
                if (!err && resp.statusCode === 200) {
                    request({url: uri + 'png'}).on('error', function(err) {
                        console.log(err);
                        download_photo(uri, filename, callback, cnt + 1);
                        return;
                    }).pipe(fs.createWriteStream(filename + 'png')).on('close', callback);
                }else {
                    console.log(err);
                    download_photo(uri, filename, callback, cnt + 1);
                    return;
                }
            });
     });
}
function run(cnt, uri, val, dir) {
    const wait = function () {
        return new Promise(async (resolve, reject) => {
            while (1) {
                if (downloading <= PARALLEL)
                    resolve(0);
                await sleep(50);
            }
        })
    }
    return new Promise(async (resolve, reject) => {
        bar1.start(cnt, 0);
        tmp = 0;
        downloading = 0;
        while (cnt > 0) {
            await wait();
            downloading++;
            download_photo(`https://i.nhentai.net/galleries/${uri}/${cnt}.`, path.join('.', dir, cnt + '.'), async function() {
                await sleep(100);
                // console.log(finish);
                downloading--;
                bar1.update(++tmp);
                if (--finish <= 0) {
                    bar1.stop();
                    remove_first_line();
                    resolve(0);
                }
            }, 0);
            cnt--;
        }
    });
}
function remove_first_line() {
    fs.readFile('queue.txt', 'utf8', function(err, data) {
        var linesExceptFirst = data.split('\n').slice(1).join('\n');
        fs.writeFile('queue.txt', linesExceptFirst, (err) => {
            if (err)
                console.log(err);
        });
    });
}
async function argv(start, queue, exit_when_end, argc) {
    if (!argc) {
        console.log(`Queue size: ${String(queue.length).red}`);
        var file = fs.createWriteStream('queue.txt');
        file.on('error', function(err) {
            console.log(err);
        });
        queue.forEach(function(i) {
            file.write(i + '\n');
        });
        file.end();
    }
    return new Promise(async (resolve, reject) => {
        end = false;
        for (var i = start; i < queue.length; i++)
            await download(queue[i]);
        if (end && exit_when_end)
            exit_program();
        resolve(0);
    });       
}

async function login(username, pass) {
    // Login
    request.get({uri: 'https://nhentai.net/login/', headers: {'User-Agent': UserAgent}}, async function(error, response, body) {
        var token = '';
        var keyword = 'name=\"csrfmiddlewaretoken\" value=\"';
        var index = body.indexOf(keyword) + keyword.length;
        while (body[index + 1] != '>')
            token += body[index++];
        var cookies = await setCookie.parse(response.headers['set-cookie'], {
            decodeValues: true,
            map: true
        });
        var cfduid = cookies.__cfduid.value;
        var options = {
            uri: 'https://nhentai.net/login/',
            headers: {
                'Host': 'nhentai.net',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'en-US,en;q=0.5',
                'User-Agent': UserAgent,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://nhentai.net/login/',
                'DNT': '1',
                'Cookie': `__cfduid=${cfduid}; csrftoken=${cookies.csrftoken.value}`,
                'Connection': 'keep-alive'
            },
            form: {
                'csrfmiddlewaretoken': token,
                'username_or_email': username,
                'password': pass
            }
        }
        request.post(options, async function(error, response, body) {
            var cookies = setCookie.parse(response.headers['set-cookie'], {
                decodeValues: true,
                map: true
            });
            var headers = {
                    'User-Agent': UserAgent,
                    'Cookie': `__cfduid=${cfduid}; csrftoken=${cookies.csrftoken.value}; sessionid=${cookies.sessionid.value}`,
            };
            request({
                uri: 'https://nhentai.net/favorites/',
                headers: headers
            }, function(error, response, body) {
                // Get pages
                var pages = 0, mul = 1;
                keyword = '\" class=\"last\"><i class=';
                index = body.indexOf(keyword) - 1;
                while (body[index] != '=') {
                    pages += body[index--] * mul;
                    mul *= 10;
                }
                select_page(pages, headers);
            });
        });
    })
}
async function select_page(pages, headers) {
    var input;
    console.log('Total pages: '.white + colors.red(String(pages)));
    const query = function(str) {
        return new Promise((resolve, reject) => {
            rl.question(str, async function(input) {
                if (input == '-1')
                    rl.close();
                else {
                    input = input.split(' ');
                    var start = Number(input[0]);
                    var end = Number(input[1]);
                    if (start <= end && end <= pages)
                        //await download_page(start, end, headers, input.length == 3 && input[2] == '0');
                        await download_page(start, end, headers, true);
                }
                resolve(0);
            });
        });
    }
    while (1) {
        //process.stdout.write(`Download page range: (ex. \"1 5\")(enter ${'-1'.red} to quit): `);
        await query(`Download page range: (ex. \"1 5\")(enter ${'-1'.red} to quit): `);        
    }
}
function get_page_data(page, headers, queue_obj) {
    return new Promise(async (resolve, reject) => {
        request({
            uri: `https://nhentai.net/favorites/?page=${page}`,
            headers: headers
        }, async function(error, response, body) {
            var index_pre = 0;
            var keyword = 'gallery-favorite\" data-id=\"';
            while (1) {
                var index = body.indexOf(keyword, index_pre);
                var val = '';
                if (index == -1) {
                    resolve(0);
                    break;
                }
                index += keyword.length;
                while (body[index] != '\"')
                    val += body[index++];
                queue_obj.queue.push(val);
                index_pre = index;
            }
        });
    });
}
function download_page(start, end, headers, save) {
    return new Promise(async (resolve, reject) => {
        var queue = [];
        for (; start <= end; start++) {
            await get_page_data(start, headers, {queue});
        }
        await argv(0, queue, false);
        resolve(0);
    });
}
async function main() {
    await argv(1, process.argv, true, true);
    var input, username, pass;
    rl.stdoutMuted = false;
    console.log(`-----------------------------------------------------------------------
.__   __.  __    __   _______ .__   __. .___________.    ___       __  
|  \\ |  | |  |  |  | |   ____||  \\ |  | |           |   /   \\     |  | 
|   \\|  | |  |__|  | |  |__   |   \\|  | \`---|  |----\`  /  ^  \\    |  | 
|  . \`  | |   __   | |   __|  |  . \`  |     |  |      /  /_\\  \\   |  | 
|  |\\   | |  |  |  | |  |____ |  |\\   |     |  |     /  _____  \\  |  | 
|__| \\__| |__|  |__| |_______||__| \\__|     |__|    /__/     \\__\\ |__|
-----------------------------------------------------------------------`);

    rl.question(`Please input parallel download image quantity (default:${'10'.red}): `, function(input) {
        if (input != '')
            PARALLEL = input;
        rl.question('Please select action:\n' +
                    '6-digit-number: Download nhentai/g/xxxxxx\n' +
                    `${'fav'.red}: Download account's favorite manga\n` +
                    `${'file'.red}: Download from ${'download.txt'.red}\n` +
                    `${'continue'.red}: Continue download(queue.txt)\n` +
                    '> ', function(input) {
            if (input == 'fav') {
                rl.question('Username or Email: ', function(username) {
                    rl.stdoutMuted = true;
                    rl.query = 'Password: ';
                    rl.question(rl.query, function(pass) {
                        rl.stdoutMuted = false;
                        console.log('');
                        login(username, pass);
                    })
                });
            }else if (input == 'file') {
                fs.readFile('download.txt', function (err, data) {
                    if (err)
                        throw err;
                    var queue = data.toString().split('\n');
                    queue.pop();
                    argv(0, queue, true);
                });
            }else if (input == 'continue') {
                fs.readFile('queue.txt', function (err, data) {
                    if (err)
                        throw err;
                    var queue = data.toString().split('\n');
                    queue.pop();
                    argv(0, queue, true);
                });
            }else
                argv(0, input.split(' '), true);
        });
    }) 
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
        if (rl.stdoutMuted)
            rl.output.write("\x1B[2K\x1B[200D"+rl.query+"["+((rl.line.length%2==1)?"=-":"-=")+"]");
        else
            rl.output.write(stringToWrite);
    };
}
function replace_str(str) {
    str = str.replace(/\//g, ' ');
    str = str.replace(/\\/g, ' ');
    str = str.replace(/:/g, ' ');
    str = str.replace(/\*/g, ' ');
    str = str.replace(/\"/g, ' ');
    str = str.replace(/</g, '(');
    str = str.replace(/>/g, ')');
    str = str.replace(/\|/g, ' ');
    str = str.replace(/\?/g, '？');
    return str;
}
function sleep(ms){
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}
