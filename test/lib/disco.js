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

    })
})
