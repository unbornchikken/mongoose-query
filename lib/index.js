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
            if (_.isString(str) && str.match(/^[$A-Z_][0-9A-Z_$]*$/i)) {
                json = str;
            }
            else {
                throw new TypeError('Argument is not in JSON format: ' + str);
            }
        }
        return json;
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
                decodedQuery.p = toJSON(query[key]);
                break;
            case('fl'):
                decodedQuery.fl = query[key] === 'true' ? true : false;
                break;
            case('ic'):
                decodedQuery.ic = query[key] === 'true' ? true : false;
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
    var originalQuery = model;

    var canDoIC = false;

    switch (q.t) {
        case('find'):
            canDoIC = true;
        case('findOne'):
            mongooseQuery = mongooseQuery.find(q.q);
            originalQuery = originalQuery.find(q.q);
            break;
        case('count'):
            mongooseQuery = mongooseQuery.count();
            originalQuery = originalQuery.count();
            break;
        case('distinct'):
            canDoIC = true;
            mongooseQuery = mongooseQuery.distinct(q.f, q.q);
            originalQuery = originalQuery.distinct(q.f, q.q);
            break;
        default:
            throw new Error('Not supported query type: "' + q.t + '".');
            return;
    }

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
