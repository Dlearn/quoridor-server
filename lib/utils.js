function getCookie (cookies, name) {
    // Returns cookies in the form "name=value"
    cookies = cookies || "";
    let cookie = cookies.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return cookie ? name + "=" + cookie.pop() : '';
};

function expireTime (limit) {
    // returns a date (format: milliseconds) thats limit milliseconds ago
    return Number(new Date()) - (limit);
};

function redisScan (redisClient, match, count, callback) {
    // Recursive wrapper for redisClient.scan that returns an array of results  
    
    function _scanHelper(cursor, match, count) {
        redisClient.scan(cursor, "match", match, "count", count, (err, val) => {
            
            if (err) {
                return callback(err);
            }
            
            results = results.concat(val[1])
            if (val[0] === "0") {
                // Iteration finished
                return callback(null, results);
            }
            
            // Iteration continues on new cursor
            return _scanHelper(val[0], match, count); 
        });
    };
    
    let cursor = 0;
    let results = []
    count = count || 10;
    
    return _scanHelper(cursor, match, count);
};


exports.getCookie = getCookie;
exports.expireTime = expireTime;
exports.redisScan = redisScan;