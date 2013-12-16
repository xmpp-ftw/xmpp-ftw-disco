'use strict';

var builder  = require('ltx')
  , Base     = require('xmpp-ftw').Base
  , dataForm = require('xmpp-ftw').utils['xep-0004']
  , rsm      = require('xmpp-ftw').utils['xep-0059']

var Disco = function() {}

Disco.prototype = new Base()

Disco.prototype.NS_ITEMS = 'http://jabber.org/protocol/disco#items'
Disco.prototype.NS_INFO  = 'http://jabber.org/protocol/disco#info'

Disco.prototype.attributes = ['type', 'name', 'category', 'var', 'jid', 'node']

Disco.prototype._events = {
    'xmpp.discover.items': 'getItems',
    'xmpp.discover.info': 'getFeatures',
    'xmpp.discover.client': 'sendResult'
}

Disco.prototype.handles = function(stanza) {
    var query
    return stanza.is('iq') &&
        !!(query = stanza.getChild('query')) &&
        (query.getNS() === this.NS_INFO)
}

Disco.prototype.handle = function(stanza) {
    this.socket.emit(
        'xmpp.discover.client',
        { from: stanza.attrs.from, id: stanza.attrs.id }
    )
    return true
}

Disco.prototype.sendResult = function(data, callback) {
    if (!data.to)
        return this._clientError('Missing \'to\' key', data, callback)
    if (!data.id)
        return this._clientError('Missing \'id\' key', data, callback)
    var stanza = new builder.Element(
        'iq',
        { to: data.to, type: 'result', id: data.id }
        ).c('query', { xmlns: this.NS_INFO })
    if (data.features) {
        if (!(data.features instanceof Array))
            return this._clientError(
                'Badly formatted \'features\' key', data, callback
            )
        var self = this
        data.features.forEach(function(item) {
            if (!item.kind) return
            var attributes = {}
            self.attributes.forEach(function(attr) {
                if (item[attr]) attributes[attr] = item[attr]
            })
            stanza.c(item.kind, attributes).up()
        })
    }
    this.client.send(stanza)
    if (callback && ('function' === typeof callback))
        callback(null, true)
}

Disco.prototype.getItems = function(data, callback) {
    var self = this
    if (!data.of)
        return this._clientError('Missing \'of\' key', data, callback)
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    var attributes = {xmlns: this.NS_ITEMS}
    if (data.node) attributes.node = data.node

    var stanza = new builder.Element(
        'iq',
        { to: data.of, type: 'get', id: this._getId() }
    ).c('query', attributes)

    if (data.rsm) rsm.build(stanza, data.rsm)

    this.manager.trackId(stanza.root().attr('id'), function(stanza) {
        self._handleDiscoItems(stanza, callback)
    })
    this.client.send(stanza)
}

Disco.prototype._handleDiscoItems = function(stanza, callback) {
    var self = this
    if (typeof(callback) !== 'function')
        return this._getLogger.error('No callback provided')
    if (stanza.attrs.type === 'error')
        return callback(self._parseError(stanza), null)
    var items = []
      , resultSet
    var query = stanza.getChild('query')
    query.getChildren('item').forEach(function(item) {
        var entry = {}
        for (var name in item.attrs) {
            var value = item.attrs[name]
            if (value.length > 0)
                entry[name] = value
        }
        items.push(entry)
    })
    if (null !== query.getChild('set', rsm.NS))
        resultSet = rsm.parse(query)
    callback(null, items, resultSet)
}

Disco.prototype.getFeatures = function(data, callback) {
    var self = this
    if (!data.of)
        return this._clientError('Missing \'of\' key', data, callback)
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    var attrs = {xmlns: this.NS_INFO }
    if (data.node) attrs.node = data.node

    var stanza = new builder.Element(
        'iq',
        { to: data.of, type: 'get', id: this._getId() }
    ).c('query', attrs)
    if (data.rsm) rsm.build(stanza, data.rsm)

    this.manager.trackId(stanza.root().attr('id'), function(stanza) {
        self._handleDiscoInfo(stanza, callback)
    })
    this.client.send(stanza)
}

Disco.prototype._handleDiscoInfo = function(stanza, callback) {
    var self = this
    if (typeof callback !== 'function')
        return this._clientError('Missing callback')
    if (stanza.attrs.type === 'error')
        return callback(self._parseError(stanza), null)
    var validTypes = ['identity', 'feature', 'item', 'x', 'set']
    var items = []
      , attrValue, resultSet

    stanza.getChild('query').children.forEach(function(item) {
        var info = { kind: item.getName().toLowerCase() }
        if (-1 === validTypes.indexOf(info.kind)) return
        if ('x' === info.kind) {
            info = {
                kind: 'form',
                form: dataForm.parseFields(item)
            }
        } else if ('set' === info.kind) {
            resultSet = rsm.parse(item.up())
        } else {
            self.attributes.forEach(function(attr) {
                if (!!(attrValue = item.attrs[attr]) &&
                    attrValue.length > 0) info[attr] = attrValue
            })
        }
        items.push(info)
    })
    callback(null, items, resultSet)
}

module.exports = Disco