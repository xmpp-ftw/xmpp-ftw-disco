var should  = require('should')
  , Disco   = require('../../lib/disco')
  , ltx     = require('ltx')
  , helper  = require('../helper')

describe('Disco', function() {

    var disco
    var socket
    var xmpp

    before(function() {
        socket = new helper.Eventer()
        xmpp = new helper.Eventer()
        var manager = {
            socket: socket,
            client: xmpp
        }
        disco = new Disco()
        disco.init({ socket: socket, client: xmpp })
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

    })
})
