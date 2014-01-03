'use strict';

var should  = require('should')
  , Disco   = require('../../index')
  , ltx     = require('ltx')
  , helper  = require('../helper')
  , rsm     = require('xmpp-ftw/').utils['xep-0059']

/* jshint -W030 */
describe('Disco', function() {

    var disco, socket, xmpp, manager

    before(function() {
        socket = new helper.SocketEventer()
        xmpp = new helper.XmppEventer()
        manager = {
            socket: socket,
            client: xmpp,
            trackId: function(id, callback) {
                this.callback = callback
            },
            makeCallback: function(error, data) {
                this.callback(error, data)
            }
        }
        disco = new Disco()
        disco.init(manager)
    })

    beforeEach(function() {
        socket.removeAllListeners()
        xmpp.removeAllListeners()
        disco.init(manager)
    })

    describe('Can handle incoming requests', function() {

        it('Shouldn\'t handle non-IQ stanzas', function() {
            disco.handles(ltx.parse('<message/>')).should.be.false
        })

        it('Shouldn\'t handle IQ without a <query/> child', function() {
            disco.handles(ltx.parse('<iq />')).should.be.false
        })

        it('Shouldn\'t handle query without appropriate xmlns', function() {
            var query = ltx.parse('<iq><query xmlns="not-disco"/></iq>')
            disco.handles(query).should.be.false
        })

        it('Should handle DISCO#info requests', function() {
            var query = ltx.parse('<iq><query xmlns="' + disco.NS_INFO + '" /></iq>')
            disco.handles(query).should.be.true
        })

        it('Sends DISCO#info requests to client', function(done) {
            var request = '<iq id="1" from="romeo@example.com" type="get">' +
                '<query xmlns="' + disco.NS_INFO + '" /></iq>'
            socket.once('xmpp.discover.client', function(data) {
                data.from.should.equal('romeo@example.com')
                data.id.should.equal('1')
                done()
            })
            disco.handle(ltx.parse(request)).should.be.true
        })

        describe('Can make DISCO#items requests', function() {

            it('Should error when no \'of\' property passed', function(done) {
                xmpp.once('stanza', function() {
                    done('Unexpected outgoing stanza')
                })
                socket.send('xmpp.discover.items', {}, function(error, success) {
                    should.not.exist(success)
                    error.type.should.equal('modify')
                    error.condition.should.equal('client-error')
                    error.description.should.equal('Missing \'of\' key')
                    error.request.should.eql({})
                    xmpp.removeAllListeners('stanza')
                    done()
                })
            })

            it('Errors when no callback provided', function(done) {
                xmpp.once('stanza', function() {
                    done('Unexpected outgoing stanza')
                })
                socket.once('xmpp.error.client', function(error) {
                    error.type.should.equal('modify')
                    error.condition.should.equal('client-error')
                    error.description.should.equal('Missing callback')
                    error.request.should.eql({ of: 'example.com' })
                    xmpp.removeAllListeners('stanza')
                    done()
                })
                socket.send('xmpp.discover.items', { of: 'example.com' })
            })

            it('Errors when non-function callback provided', function(done) {
                xmpp.once('stanza', function() {
                    done('Unexpected outgoing stanza')
                })
                socket.once('xmpp.error.client', function(error) {
                    error.type.should.equal('modify')
                    error.condition.should.equal('client-error')
                    error.description.should.equal('Missing callback')
                    error.request.should.eql({ of: 'example.com' })
                    xmpp.removeAllListeners('stanza')
                    done()
                })
                socket.send('xmpp.discover.items', { of: 'example.com' }, true)
            })

            it('Sends expected stanza', function(done) {
                var of = 'wonderland.lit'
                xmpp.once('stanza', function(stanza) {
                    stanza.is('iq').should.be.true
                    stanza.attrs.to.should.equal(of)
                    stanza.getChild('query', disco.NS_ITEMS)
                        .should.exist
                    done()
                })
                socket.send('xmpp.discover.items', { of: of }, function() {})
            })

            it('Sends expected stanza with RSM', function(done) {
                var request = {
                    of: 'wonderland.lit',
                    rsm: {
                        after: '12345',
                        max: '20'
                    }
                }
                xmpp.once('stanza', function(stanza) {
                    stanza.is('iq').should.be.true
                    stanza.attrs.to.should.equal(request.of)
                    var query = stanza.getChild('query', disco.NS_ITEMS)
                    var set = query.getChild('set', rsm.NS)
                    set.should.exist
                    set.getChildText('after').should.equal(request.rsm.after)
                    set.getChildText('max').should.equal(request.rsm.max)
                    done()
                })
                socket.send('xmpp.discover.items', request, function() {})
            })

            it('Sends expected stanza with node', function(done) {
                var request = { of: 'wonderland.lit', node: 'some-node' }
                xmpp.once('stanza', function(stanza) {
                    stanza.getChild('query', disco.NS_ITEMS)
                        .attrs.node.should.equal(request.node)
                    done()
                })
                socket.send('xmpp.discover.items', request, function() {})
            })

            it('Can handle error response from server', function(done) {
                var of = 'wonderland.lit'
                xmpp.once('stanza', function(stanza) {
                    stanza.is('iq').should.be.true
                    stanza.attrs.type.should.equal('get')
                    stanza.attrs.to.should.equal(of)
                    should.exist(stanza.attrs.id)
                    stanza.getChild('query', disco.NS_ITEMS).should.exist
                    manager.makeCallback(helper.getStanza('iq-error'))
                })
                var callback = function(error, success) {
                    should.not.exist(success)
                    error.should.eql({
                        type: 'cancel',
                        condition: 'error-condition'
                    })
                    done()
                }
                socket.send('xmpp.discover.items', { of: of }, callback)
            })

            it('Can handle DISCO#items response', function(done) {
                var request = {
                    of: 'wonderland.lit',
                    node: 'rabbithole'
                }
                xmpp.once('stanza', function(stanza) {
                    stanza.is('iq').should.be.true
                    stanza.attrs.type.should.equal('get')
                    stanza.attrs.to.should.equal(request.of)
                    should.exist(stanza.attrs.id)
                    var query = stanza.getChild('query', disco.NS_ITEMS)
                    query.attrs.node.should.equal(request.node)
                    manager.makeCallback(helper.getStanza('disco-items'))
                })
                var callback = function(error, data) {
                    should.not.exist(error)
                    data.length.should.equal(2)
                    data[0].should.eql({ jid: 'jid1', name: 'name1' })
                    data[1].jid.should.equal('jid2')
                    data[1].name.should.equal('name2')
                    data[1].type.should.equal('type2')
                    data[1].var.should.equal('var2')
                    data[1].category.should.equal('category2')
                    data[1].node.should.equal('node2')
                    done()
                }
                socket.send('xmpp.discover.items', request, callback)
            })

            it('Sends RSM data back if provided', function(done) {
                var request = {
                    of: 'wonderland.lit'
                }
                xmpp.once('stanza', function() {
                    var stanza = helper.getStanza('disco-items-with-rsm')
                    manager.makeCallback(stanza)
                })
                var callback = function(error, data, rsm) {
                    should.not.exist(error)
                    data.should.exist
                    rsm.should.eql({
                        first: 'first',
                        last: 'last',
                        count: 100
                    })
                    done()
                }
                socket.send('xmpp.discover.items', request, callback)
            })

        })

        describe('Can make DISCO#info requests', function() {

            it('Should error when no \'of\' property passed', function(done) {
                xmpp.once('stanza', function() {
                    done('Unexpected outgoing stanza')
                })
                socket.send('xmpp.discover.info', {}, function(error, success) {
                    should.not.exist(success)
                    error.type.should.equal('modify')
                    error.condition.should.equal('client-error')
                    error.description.should.equal('Missing \'of\' key')
                    error.request.should.eql({})
                    xmpp.removeAllListeners('stanza')
                    done()
                })
            })

            it('Errors when no callback provided', function(done) {
                xmpp.once('stanza', function() {
                    done('Unexpected outgoing stanza')
                })
                socket.once('xmpp.error.client', function(error) {
                    error.type.should.equal('modify')
                    error.condition.should.equal('client-error')
                    error.description.should.equal('Missing callback')
                    error.request.should.eql({ of: 'example.com' })
                    xmpp.removeAllListeners('stanza')
                    done()
                })
                socket.send('xmpp.discover.info', { of: 'example.com' })
            })

            it('Errors when non-function callback provided', function(done) {
                xmpp.once('stanza', function() {
                    done('Unexpected outgoing stanza')
                })
                socket.once('xmpp.error.client', function(error) {
                    error.type.should.equal('modify')
                    error.condition.should.equal('client-error')
                    error.description.should.equal('Missing callback')
                    error.request.should.eql({ of: 'example.com' })
                    xmpp.removeAllListeners('stanza')
                    done()
                })
                socket.send('xmpp.discover.info', { of: 'example.com' }, true)
            })

            it('Sends expected stanza', function(done) {
                var of = 'wonderland.lit'
                xmpp.once('stanza', function(stanza) {
                    stanza.is('iq').should.be.true
                    stanza.attrs.to.should.equal(of)
                    stanza.getChild('query', disco.NS_INFO)
                        .should.exist
                    done()
                })
                socket.send('xmpp.discover.info', { of: of }, function() {})
            })

            it('Sends expected stanza with RSM', function(done) {
                var request = {
                    of: 'wonderland.lit',
                    rsm: {
                        after: '12345',
                        max: '20'
                    }
                }
                xmpp.once('stanza', function(stanza) {
                    stanza.is('iq').should.be.true
                    stanza.attrs.to.should.equal(request.of)
                    var query = stanza.getChild('query', disco.NS_INFO)
                    var set = query.getChild('set', rsm.NS)
                    set.should.exist
                    set.getChildText('after').should.equal(request.rsm.after)
                    set.getChildText('max').should.equal(request.rsm.max)
                    done()
                })
                socket.send('xmpp.discover.info', request, function() {})
            })

            it('Sends expected stanza with node', function(done) {
                var request = { of: 'wonderland.lit', node: 'some-node' }
                xmpp.once('stanza', function(stanza) {
                    stanza.getChild('query', disco.NS_INFO)
                        .attrs.node.should.equal(request.node)
                    done()
                })
                socket.send('xmpp.discover.info', request, function() {})
            })

            it('Can handle error response from server', function(done) {
                var of = 'wonderland.lit'
                xmpp.once('stanza', function(stanza) {
                    stanza.is('iq').should.be.true
                    stanza.attrs.type.should.equal('get')
                    stanza.attrs.to.should.equal(of)
                    should.exist(stanza.attrs.id)
                    stanza.getChild('query', disco.NS_INFO).should.exist
                    manager.makeCallback(helper.getStanza('iq-error'))
                })
                var callback = function(error, success) {
                    should.not.exist(success)
                    error.should.eql({
                        type: 'cancel',
                        condition: 'error-condition'
                    })
                    done()
                }
                socket.send('xmpp.discover.info', { of: of }, callback)
            })

            it('Can handle successful response', function(done) {
                var request = {
                    of: 'wonderland.lit',
                    node: 'rabbithole'
                }
                xmpp.once('stanza', function(stanza) {
                    stanza.is('iq').should.be.true
                    stanza.attrs.type.should.equal('get')
                    stanza.attrs.to.should.equal(request.of)
                    should.exist(stanza.attrs.id)
                    var query = stanza.getChild('query', disco.NS_INFO)
                    query.attrs.node.should.equal(request.node)
                    manager.makeCallback(helper.getStanza('disco-info'))
                })
                var callback = function(error, data) {
                    should.not.exist(error)
                    // Element <ignore/> will have been ignored
                    data.length.should.equal(3)
                    data[0].kind.should.equal('identity')
                    data[0].type.should.equal('type1')
                    data[0].name.should.equal('name1')
                    data[0].category.should.equal('category1')
                    data[1].should.eql({ kind: 'feature', var: 'var2' })
                    data[2].kind.should.equal('item')
                    data[2].var.should.equal('var3')
                    data[2].jid.should.equal('jid3')
                    data[2].node.should.equal('node3')
                    done()
                }
                socket.send('xmpp.discover.info', request, callback)
            })

            it('Can handle response with data form', function(done) {
                var request = {
                    of: 'wonderland.lit',
                    node: 'rabbithole'
                }
                xmpp.once('stanza', function(stanza) {
                    stanza.is('iq').should.be.true
                    stanza.attrs.type.should.equal('get')
                    stanza.attrs.to.should.equal(request.of)
                    should.exist(stanza.attrs.id)
                    var query = stanza.getChild('query', disco.NS_INFO)
                    query.attrs.node.should.equal(request.node)
                    stanza = helper.getStanza('disco-info-with-data-form')
                    manager.makeCallback(stanza)
                })
                var callback = function(error, data) {
                    should.not.exist(error)
                    data.length.should.equal(1)
                    data[0].kind.should.equal('form')
                    data[0].form.fields.length.should.equal(1)
                    done()
                }
                socket.send('xmpp.discover.info', request, callback)
            })

            it('Sends RSM data back if provided', function(done) {
                var request = {
                    of: 'wonderland.lit'
                }
                xmpp.once('stanza', function() {
                    var stanza = helper.getStanza('disco-info-with-rsm')
                    manager.makeCallback(stanza)
                })
                var callback = function(error, data, rsm) {
                    should.not.exist(error)
                    data.should.exist
                    rsm.should.eql({
                        first: 'first',
                        last: 'last',
                        count: 100
                    })
                    done()
                }
                socket.send('xmpp.discover.info', request, callback)
            })

        })

    })

    describe('Can send disco#info responses', function() {

        it('Errors if no \'to\' key provided', function(done) {
            var request = {}
            xmpp.once('stanza', function() {
                done('Unexpected outgoing stanza')
            })
            socket.once('xmpp.error.client', function(error) {
                error.type.should.equal('modify')
                error.condition.should.equal('client-error')
                error.description.should.equal('Missing \'to\' key')
                error.request.should.eql(request)
                xmpp.removeAllListeners('stanza')
                done()
            })
            socket.send('xmpp.discover.client', request)
        })

        it('Errors if no \'id\' key provided', function(done) {
            var request = { to: 'romeo@shakespeare.lit/desktop' }
            xmpp.once('stanza', function() {
                done('Unexpected outgoing stanza')
            })
            socket.once('xmpp.error.client', function(error) {
                error.type.should.equal('modify')
                error.condition.should.equal('client-error')
                error.description.should.equal('Missing \'id\' key')
                error.request.should.eql(request)
                xmpp.removeAllListeners('stanza')
                done()
            })
            socket.send('xmpp.discover.client', request)
        })

        it('Sends expected stanza with no info entries', function(done) {
            var request = {
                to: 'romeo@shakespeare.lit/desktop',
                id: '555:info'
            }
            xmpp.once('stanza', function(stanza) {
                stanza.is('iq').should.be.true
                stanza.attrs.to.should.equal(request.to)
                stanza.attrs.id.should.equal(request.id)
                stanza.attrs.type.should.equal('result')
                var query = stanza.getChild('query')
                should.exist(query)
                query.attrs.xmlns.should.equal(disco.NS_INFO)
                query.children.length.should.equal(0)
                done()
            })
            socket.send('xmpp.discover.client', request)
        })

        it('Errors if features is not an array', function(done) {
            var request = {
                to: 'romeo@shakespeare.lit/desktop',
                id: '555:info',
                features: true
            }
            xmpp.once('stanza', function() {
                done('Unexpected outgoing stanza')
            })
            socket.once('xmpp.error.client', function(error) {
                error.type.should.equal('modify')
                error.condition.should.equal('client-error')
                error.description.should.equal('Badly formatted \'features\' key')
                error.request.should.eql(request)
                xmpp.removeAllListeners('stanza')
                done()
            })
            socket.send('xmpp.discover.client', request)
        })

        it('Sends expected stanza with features', function(done) {
            var request = {
                to: 'romeo@shakespeare.lit/desktop',
                id: '555:info',
                features: [
                    { kind: 'kind1', name: 'name1', category: 'cat1',
                      var: 'var1', jid: 'jid1', node: 'node1' },
                    { kind: 'kind2' },
                    {}
                ]
            }
            xmpp.once('stanza', function(stanza) {
                stanza.is('iq').should.be.true
                stanza.attrs.to.should.equal(request.to)
                stanza.attrs.id.should.equal(request.id)
                stanza.attrs.type.should.equal('result')
                var query = stanza.getChild('query')
                should.exist(query)
                query.attrs.xmlns.should.equal(disco.NS_INFO)
                query.children.length.should.equal(2)
                var children = query.children
                children[0].name.should.equal('kind1')
                children[0].attrs.name.should.equal('name1')
                children[0].attrs.category.should.equal('cat1')
                children[0].attrs.var.should.equal('var1')
                children[0].attrs.jid.should.equal('jid1')
                children[0].attrs.node.should.equal('node1')
                children[1].name.should.eql('kind2')
                done()
            })
            socket.send('xmpp.discover.client', request)
        })

        it('Returns true if callback provided', function(done) {
            var request = {
                to: 'romeo@shakespeare.lit/desktop',
                id: '555:info',
                features: [
                    { kind: 'kind1', name: 'name1', category: 'cat1',
                      var: 'var1', jid: 'jid1', node: 'node1' },
                    { kind: 'kind2' },
                    {}
                ]
            }
            socket.send('xmpp.discover.client', request, function(error, success) {
                should.not.exist(error)
                success.should.be.true
                done()
            })
        })

    })

})
