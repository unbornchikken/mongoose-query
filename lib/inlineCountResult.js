var _ = require('lodash');
var Promise = require('bluebird');

function InlineCountResult(originalQuery, query) {
    this.originalQuery = originalQuery;
    this.query = query;
}

InlineCountResult.prototype.lean = function () {
    return new InlineCountResult(this.originalQuery, this.query.lean.apply(this.query, arguments));
};

InlineCountResult.prototype.select = function () {
    return new InlineCountResult(this.originalQuery, this.query.select.apply(this.query, arguments));
};

InlineCountResult.prototype.where = function () {
    return new InlineCountResult(this.originalQuery.where.apply(this.originalQuery, arguments), this.query.where.apply(this.query, arguments));
};

InlineCountResult.prototype.equals = function () {
    return new InlineCountResult(this.originalQuery.equals.apply(this.originalQuery, arguments), this.query.equals.apply(this.query, arguments));
};

InlineCountResult.prototype.in = function () {
    return new InlineCountResult(this.originalQuery.in.apply(this.originalQuery, arguments), this.query.in.apply(this.query, arguments));
};

InlineCountResult.prototype.and = function () {
    return new InlineCountResult(this.originalQuery.and.apply(this.originalQuery, arguments), this.query.and.apply(this.query, arguments));
};

InlineCountResult.prototype.exec = function (callback) {
    var self = this;
    var p = new Promise(function (resolve, reject) {
        Promise.resolve(self.query.exec()).then(
            function (queryResult) {
                return Promise.resolve(self.originalQuery.count().exec()).then(
                    function (count) {
                        resolve({
                            data: queryResult,
                            count: count
                        });
                    });
            }).catch(
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
