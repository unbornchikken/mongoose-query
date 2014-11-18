var _ = require('lodash');
var Promise = require('bluebird');

function InlineCountResult(originalQuery, query) {
    this.originalQuery = originalQuery;
    this.query = query;
}

InlineCountResult.prototype.lean = function(lean) {
    lean = _.isBoolean(lean) ? lean : true;
    return new InlineCountResult(this.originalQuery.lean(lean), this.query);
};

InlineCountResult.prototype.exec = function (callback) {
    var self = this;
    var p = new Promise(function (resolve, reject) {
        Promise.resolve(self.query.exec()).then(
            function (queryResult) {
                return Promise.resolve(self.originalQuery.count().exec()).then(
                    function(count) {
                        resolve({
                            data: queryResult,
                            count: count
                        });
                    },
                    function(e) {
                        reject(e);
                    });
            },
            function (e) {
                reject(e);
            });
    });

    if (_.isFunction(callback)) {
        p.nodeify(callback);
        return p;
    }
    else {
        return p;
    }
};

module.exports = InlineCountResult;
