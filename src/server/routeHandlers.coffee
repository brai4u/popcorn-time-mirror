'use strict'

fs          = require 'fs'
rangeParser = require 'range-parser'
url         = require 'url'
mime        = require 'mime'
pump        = require 'pump'

torrentProgress = require './torrentProgress'
torrentStats    = require './torrentStats'

serializeFiles = (torrent) ->
  torrentFiles = torrent.files
  pieceLength = torrent.torrent.pieceLength
    
  torrentFiles.map (f) ->
    start = f.offset / pieceLength | 0
    end = (f.offset + f.length - 1) / pieceLength | 0
    
    name: f.name
    path: f.path
    link: 'http://127.0.0.1:' + process.argv[2] + '/torrents/' + torrent.infoHash + '/files/' + encodeURIComponent(f.path)
    length: f.length
    offset: f.offset
    selected: torrent.selection.some (s) ->
      s.from <= start and s.to >= end

serialize = (torrent) ->
  if !torrent.torrent
    return { infoHash: torrent.infoHash }

  infoHash: torrent.infoHash
  name: torrent.torrent.name
  interested: torrent.amInterested
  ready: torrent.ready
  files: serializeFiles torrent
  progress: torrentProgress torrent.bitfield.buffer

serializeObject = (torrents) ->
  object = {}

  for indx, torrent of torrents
    object[indx] = serialize torrent

  object

module.exports = (torrentStore) ->
  getM3UPlaylist: (req, res) ->
    torrent = req.torrent

    res.setHeader 'Content-Type', 'application/x-mpegurl; charset=utf-8'

    res.send '#EXTM3U\n' + torrent.files.map((f) ->
      '#EXTINF:-1,' + f.path + '\n' + req.protocol + '://' + req.get('host') + '/torrents/' + torrent.infoHash + '/files/' + encodeURIComponent(f.path)
    ).join('\n')

  stopTorrent: (req, res) ->
    index = parseInt(req.params.index)
    
    if index >= 0 and index < req.torrent.files.length
      req.torrent.files[index].deselect()
    else
      req.torrent.files.forEach (f) ->
        f.deselect()

    res.send 200

  startTorrent: (req, res) ->
    index = parseInt(req.params.index)

    if index >= 0 and index < req.torrent.files.length
      req.torrent.files[index].select()
    else
      req.torrent.files.forEach (f) ->
        f.select()

    res.send 200

  addTorrent: (req, res) ->
    torrentStore.add(req.body.link)
    .then (infoHash) ->
      res.send infoHash: infoHash
    .catch (err) ->
      res.send 500, err
 
  uploadTorrent: (req, res) ->
    file = req.files and req.files.file

    if !file
      return res.send(500, 'file is missing')

    torrentStore.add file.path, (err, infoHash) ->
      if err res.send 500, err
      else res.send infoHash: infoHash

      fs.unlink file.path

  getAllTorrents: (req, res) ->
    res.send serializeObject torrentStore.hashList()

  getTorrent: (req, res) ->
    res.send serialize(req.torrent)

  pauseSwarm: (req, res) ->
    req.torrent.swarm.pause()
    res.send 200

  torrentStats: (req, res) ->
    res.send stats(req.torrent)

  deleteTorrent: (req, res) ->
    torrentStore.remove req.torrent.infoHash
    res.send 200

  resumeSwarm: (req, res) ->
    req.torrent.swarm.resume()
    res.send 200

  streamTorrent: (req, res) ->
    torrent = req.torrent
    file = null

    for torrentFile in torrent.files
      if torrentFile.path is req.params.path
        file = torrentFile
        break

    if !file
      return res.send(404)
    
    if typeof req.query.ffmpeg != 'undefined'
      return require('./ffmpeg')(req, res, torrent, file)
    
    range = req.headers.range
    range = range and rangeParser(file.length, range)[0]
    
    res.setHeader 'Accept-Ranges', 'bytes'
    res.type file.name
    
    req.connection.setTimeout 3600000
    
    if !range
      res.setHeader 'Content-Length', file.length
      if req.method == 'HEAD'
        return res.end()
      return pump(file.createReadStream(), res)
    
    res.statusCode = 206
    res.setHeader 'Content-Length', range.end - (range.start) + 1
    res.setHeader 'Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + file.length
    
    if req.method == 'HEAD'
      return res.end()
    
    pump file.createReadStream(range), res
    
    return

 