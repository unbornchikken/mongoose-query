/**
 MONGOOSE QUERY GENERATOR FROM HTTP URL
 e.g.
 var QueryPlugin = require(mongoose-query);
 schema.plugin(QueryPlugin);
 mymodel.Query(req.query, function(error, data){
  });

 */
var util = require('util')
    , _ = require('lodash')
    , InlineCountResult = require('./inlineCountResult');

var dbg = false;

var parseQuery = function (query, options) {
    /**

     reserved keys: q,t,f,s,sk,l,p,ic

     [q=<query>][&t=<type>][&f=<fields>][&s=<order>][&sk=<skip>][&l=<limit>][&p=<populate>]
     q=<query> - restrict results by the specified JSON query
     t=<type> - find|findOne|count|aggregate|distinct..
     f=<set of fields> - specify the set of fields to include or exclude in each document (1 - include; 0 - exclude)
     s=<sort order> - specify the order in which to sort each specified field (1- ascending; -1 - descending)
     sk=<num results to skip> - specify the number of results to skip in the result set; useful for paging
     l=<limit> - specify the limit for the number of results (default is 1000)
     p=<populate> - specify the fields for populate
     ic=<inline count> - if true, count will be inlined into: { data: ..., count: xxx }

     alternative search conditions:
     "key={in}a,b"
     "At least one of these is in array"

     "key={nin}a,b"
     "Any of these values is not in array"

     "key={all}a,b"
     "All of these contains in array"

     "key={empty}-"
     "Field is empty or not exists"

     "key={mod}a,b"
     "Docs where key mod a is b"

     "key={gt}a"
     "Docs key is greater than a"

     "key={lt}a"
     "Docs key is lower than a"

     "key=a|b|c"
     "Docs where key type is Array, contains at least one of given value
     */

    var decodedQuery = {
        q: {},      //  query
        map: '',
        reduce: '',
        t: 'find',   //  count
        f: false,      // fields
        s: false,      //  sort
        sk: false,      //  skip
        l: 1000,     //  limit
        p: false,    //populate
        fl: false,    //flat
        ic: false
    }

    var toJSON = function (str) {
        var json = {}
        try {
            json = JSON.parse(str);
        } catch (e) {
            console.log('parsing error');
            json = {};
        }
        return json;
    }
    var convertToBoolean = function (str) {
        if (str.toLowerCase() === "true" ||
            str.toLowerCase() === "yes") {
            return true;
        } else if (
            str.toLowerCase() === "false" ||
            str.toLowerCase() === "no") {
            return false;
        } else {
            return -1;
        }
    }
    var addCondition = function (key, cond) {
        if (cond['$or']) {
            if (!decodedQuery.q.hasOwnProperties('$or')) {
                decodedQuery.q['$or'] = [];
            }
            decodedQuery.q['$or'].push({key: cond});
        } else {
            decodedQuery.q[key] = cond;
        }
    }

    function parseDate(str) {
        //31/2/2010
        var m = str.match(/^(\d{1,2})[\/\s\.\-\,](\d{1,2})[\/\s\.\-\,](\d{4})$/);
        return (m) ? new Date(m[3], m[2] - 1, m[1]) : null;
    }

    function parseDate2(str) {
        //2010/31/2
        var m = str.match(/^(\d{4})[\/\s\.\-\,](\d{1,2})[\/\s\.\-\,](\d{1,2})$/);
        return (m) ? new Date(m[1], m[2] - 1, m[3]) : null;
    }

    var isStringValidDate = function (str) {
        if (util.isDate(new Date(str)))return true;
        if (util.isDate(parseDate(str)))return true;
        if (util.isDate(parseDate2(str)))return true;
        return false;
    }
    var parseParam = function (key, val) {
        var lcKey = key;

        var operator = false;
        if (typeof val == 'string') {
            operator = val.match(/\{(.*)\}/);
            val = val.replace(/\{(.*)\}/, '');
            if (operator) {
                operator = operator[1];
            }
        }
        if (key[0] == '$') return; //bypass $ characters for security reasons!
        if (val === "") {
            return;
        } else if (lcKey === "skips") {
            decodedQuery.sk = parseInt(val);
        } else if (lcKey === "select") {
            decodedQuery.s = val;
        } else if (lcKey === "limit") {
            decodedQuery.l = val;
        } else if (lcKey === "sort_by") {
            var parts = val.split(',');
            decodedQuery.s = {};
            decodedQuery.s[parts[0]] = parts.length > 1 ? parseInt(parts[1]) : 1;
        } else {
            if (convertToBoolean(val) != -1) {
                var b = convertToBoolean(val);
                if (b == false) {
                    var orCond = {}
                    orCond[lcKey] = {$exists: false};
                    decodedQuery.q['$or'] = []
                    decodedQuery.q['$or'].push(orCond);
                    orCond[lcKey] = b;
                    decodedQuery.q['$or'].push(orCond);
                }
                else addCondition(lcKey, b);
            } else {
                if (operator === "gt" ||
                    operator === "gte" ||
                    operator === "lt" ||
                        /*operator === "in" ||
                         operator === "nin" ||*/
                    operator === "lte") {
                    if (isStringValidDate(val)) {
                        val = new Date(val);
                    }
                    tmp = {}
                    var arrayOperators = ['in', 'nin', 'all', 'mod']
                    if (arrayOperators.indexOf(operator) >= 0) {
                        val = val.split(',');
                        tmp = []
                    }
                    tmp["$" + operator] = val;


                    addCondition(lcKey, tmp);

                } else if (operator == 'i') {
                    addCondition(lcKey, new RegExp('^' + val + '$', 'i')); //http://scriptular.com/
                } else if (operator == 'e') {
                    addCondition(lcKey, new RegExp(val + '$'));
                } else if (operator == 'b') {
                    addCondition(lcKey, new RegExp('^' + val));
                } else if (operator == 'in') {
                    var parts = val.split(',');
                    addCondition(lcKey, {'$in': parts});
                } else if (operator == 'ne') {
                    addCondition(lcKey, {'$ne': val});
                } else if (operator == 'nin') {
                    var parts = val.split(',');
                    addCondition(lcKey, {'$nin': parts});
                } else if (operator == 'all') {
                    var parts = val.split(',');
                    addCondition(lcKey, {'$all': parts});
                } else if (operator == 'size') {
                    addCondition(lcKey, {'$size': val});
                } else if (operator == 'm') {
                    // key={m}<key>,<value>
                    value = value.split(',');
                    decodedQuery.q[key] = {};
                    decodedQuery.q[key]['$elemMatch'] = {};
                    decodedQuery.q[key]['$elemMatch']['key'] = value[0];
                    decodedQuery.q[key]['$elemMatch']['value'] = value[1];
                } else if (operator == 'empty') {
                    addCondition('$or', [{lcKey: ''}, {lcKey: {'$exists': false}}]);
                } else if (operator == 'c') {
                    val = val.split('/');
                    addCondition(lcKey, new RegExp(val[0], val[1]));
                } else {
                    if (options.ignoreKeys === true) return;
                    if (options.ignoreKeys && typeof options.ignoreKeys.indexOf === 'function' && options.ignoreKeys.indexOf(key) != -1) return;
                    var parts = val.split('|');
                    if (parts.length > 1) {
                        var arr = []
                        for (i = 0; i < parts.length; i++) {
                            tmp = {}
                            tmp[lcKey] = parts[i];
                            arr.push(tmp);
                        }
                        addCondition('$or', arr);
                    } else {
                        addCondition(lcKey, val);
                    }
                }
            }
        }
    }

    function walker(value, key, obj) {
        if (value !== null && typeof value === "object") {
            // Recurse into children
            _.each(value, walker);
        } else if (typeof value === "string") {
            if (key === '$regex') {
                var m = value.match(/\/(.*)\//);
                if (m) {
                    var options;
                    if (obj['$options']) {
                        m[2] = obj['$options']
                        delete obj['$options'];
                    }
                    obj[key] = new RegExp(m[1], m[2]);
                }
            }
        }
    }

    for (var key in query) {
        switch (key) {
            case('q'):
                decodedQuery.q = toJSON(decodeURIComponent(query[key]));
                _.each(decodedQuery.q, walker);
                break;
            case('t'):
                decodedQuery.t = query[key];
                break;
            case('f'):
                decodedQuery.f = query[key];
                break;
            case('s'):
                decodedQuery.s = toJSON(query[key]);
                break;
            case('sk'):
                decodedQuery.sk = parseInt(query[key]);
                break;
            case('l'):
                decodedQuery.l = parseInt(query[key]);
                break;
            case('p'):
                decodedQuery.p = query[key];
                break;
            case('map'):
                decodedQuery.map = query[key];
                break;
            case('reduce'):
                decodedQuery.reduce = query[key];
                break;
            case('fl'):
                decodedQuery.fl = query[key] === 'true' ? true : false;
                break;
            case('ic'):
                decodedQuery.ic = query[key] === 'true' ? true : false;
                break;
            default:
                parseParam(key, query[key]);
                break;
        }
    }
    return decodedQuery;
}

var doQuery = function (query, model, options, callback) {
    if (dbg)console.log(query);
    var q = parseQuery(query, options);
    if (!model)return q;
    if (dbg)console.log(q);
    var mongooseQuery = model;

    var canDoIC = false;

    switch (q.t) {
        case('find'):
            canDoIC = true;
        case('findOne'):
            mongooseQuery = mongooseQuery.find(q.q);
            break;
        case('count'):
            mongooseQuery = mongooseQuery.count();
            break;
        case('distinct'):
            canDoIC = true;
            mongooseQuery = mongooseQuery.distinct(q.f, q.q);
            break;
        default:
            throw new Error('Not supported query type: "' + q.t + '".');
            return;
    }

    var originalQuery = mongooseQuery;

    if (q.s) mongooseQuery = mongooseQuery.sort(q.s);
    if (q.sk) mongooseQuery = mongooseQuery.skip(q.sk);
    if (q.l) mongooseQuery = mongooseQuery.limit(q.l);
    if (q.f) mongooseQuery = mongooseQuery.select(q.f);
    if (q.p) mongooseQuery = mongooseQuery.populate(q.p);

    if (q.ic) {
        // Do inline count:
        mongooseQuery = new InlineCountResult(originalQuery, mongooseQuery);
    }
    else if (!canDoIC) {
        throw new Error('Inline count is not supported for query type: "' + q.t + '".');
    }

    return mongooseQuery;
}

module.exports = exports = function QueryPlugin(schema, options) {
    schema.statics.query = schema.statics.Query = function (query) {
        options = options || {};
        return doQuery(query, this, options)
    }
}
