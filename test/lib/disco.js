var should  = require('should')
  , Disco   = require('../../lib/disco')
  , ltx     = require('ltx')
  , helper  = require('../helper')

describe('Disco', function() {

    var disco, socket, xmpp, manager

    before(function() {
        socket = new helper.Eventer()
        xmpp = new helper.Eventer()
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
            var request = '<iq id="1" from="romeo@example.com" type="get">'
                + '<query xmlns="' + disco. NS_INFO + '" /></iq>'
            xmpp.once('stanza', function(stanza) {
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
            socket.once('xmpp.discover.client', function(data, callback) {
                var features = [
                    { kind: 'kind1', name: 'name1', category: 'cat1', var: 'var1', jid: 'jid1', node: 'node1' },
                    { kind: 'kind2' },
                    {}
                ]
                callback(features)
            })
            disco.handle(ltx.parse(request)).should.be.true            
        })

        describe('Can make DISCO#items requests', function() {

            it('Should error when no \'of\' property passed', function(done) {
                xmpp.once('stanza', function() {
                    done('Unexpected outgoing stanza')
                })
                socket.emit('xmpp.discover.items', {}, function(error, success) {
                    should.not.exist(success)
                    error.type.should.equal('modify')
                    error.condition.should.equal('client-error')
                    error.description.should.equal("Missing 'of' key")
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
                    error.description.should.equal("Missing callback")
                    error.request.should.eql({ of: 'example.com' })
                    xmpp.removeAllListeners('stanza')
                    done()
                })
                socket.emit('xmpp.discover.items', { of: 'example.com' })
            })

            it('Errors when non-function callback provided', function(done) {
                xmpp.once('stanza', function() {
                    done('Unexpected outgoing stanza')
                })
                socket.once('xmpp.error.client', function(error) {
                    error.type.should.equal('modify')
                    error.condition.should.equal('client-error')
                    error.description.should.equal("Missing callback")
                    error.request.should.eql({ of: 'example.com' })
                    xmpp.removeAllListeners('stanza')
                    done()
                })
                socket.emit('xmpp.discover.items', { of: 'example.com' }, true)
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
                socket.emit('xmpp.discover.items', { of: of }, function() {})
            })

            it('Sends expected stanza with node', function(done) {
                var request = { of: 'wonderland.lit', node: 'some-node' }
                xmpp.once('stanza', function(stanza) {
                    stanza.getChild('query', disco.NS_ITEMS)
                        .attrs.node.should.equal(request.node)
                    done()
                })
                socket.emit('xmpp.discover.items', request, function() {})
            })

            it('Can handle error response from server', function(done) {
                var of = 'wonderland.lit'
                xmpp.once('stanza', function(stanza) {
                     stanza.is('iq').should.be.true
                     stanza.attrs.type.should.equal('get')
                     stanza.attrs.to.should.equal(of)
                     should.exist(stanza.attrs.id)
                     var query = stanza.getChild('query', disco.NS_ITEMS)
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
                socket.emit('xmpp.discover.items', { of: of }, callback)
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
                socket.emit('xmpp.discover.items', request, callback) 
            })

        })

        describe('Can make DISCO#info requests', function() {

           it('Should error when no \'of\' property passed', function(done) {
                xmpp.once('stanza', function() {
                    done('Unexpected outgoing stanza')
                })
                socket.emit('xmpp.discover.info', {}, function(error, success) {
                    should.not.exist(success)
                    error.type.should.equal('modify')
                    error.condition.should.equal('client-error')
                    error.description.should.equal("Missing 'of' key")
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
                    error.description.should.equal("Missing callback")
                    error.request.should.eql({ of: 'example.com' })
                    xmpp.removeAllListeners('stanza')
                    done()
                })
                socket.emit('xmpp.discover.info', { of: 'example.com' })
            })

            it('Errors when non-function callback provided', function(done) {
                xmpp.once('stanza', function() {
                    done('Unexpected outgoing stanza')
                })
                socket.once('xmpp.error.client', function(error) {
                    error.type.should.equal('modify')
                    error.condition.should.equal('client-error')
                    error.description.should.equal("Missing callback")
                    error.request.should.eql({ of: 'example.com' })
                    xmpp.removeAllListeners('stanza')
                    done()
                })
                socket.emit('xmpp.discover.info', { of: 'example.com' }, true)
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
                socket.emit('xmpp.discover.info', { of: of }, function() {})
            })

            it('Sends expected stanza with node', function(done) {
                var request = { of: 'wonderland.lit', node: 'some-node' }
                xmpp.once('stanza', function(stanza) {
                    stanza.getChild('query', disco.NS_INFO)
                        .attrs.node.should.equal(request.node)
                    done()
                })
                socket.emit('xmpp.discover.info', request, function() {})
            })

            it('Can handle error response from server', function(done) {
                var of = 'wonderland.lit'
                xmpp.once('stanza', function(stanza) {
                     stanza.is('iq').should.be.true
                     stanza.attrs.type.should.equal('get')
                     stanza.attrs.to.should.equal(of)
                     should.exist(stanza.attrs.id)
                     var query = stanza.getChild('query', disco.NS_INFO)
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
                socket.emit('xmpp.discover.info', { of: of }, callback)
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
                socket.emit('xmpp.discover.info', request, callback)
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
                     var stanza = helper.getStanza('disco-info-with-data-form')
                     manager.makeCallback(stanza)
                })
                var callback = function(error, data) {
                    should.not.exist(error)
                    data.length.should.equal(1)
                    data[0].kind.should.equal('form')
                    data[0].form.fields.length.should.equal(1)
                    done()
                }
                socket.emit('xmpp.discover.info', request, callback)
            })

        })

    })

})
