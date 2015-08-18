(function (App) {
    'use strict';

    var torrentHealth = require('torrent-tracker-health');
    var cancelTorrentHealth = function () {};
    var torrentHealthRestarted = null;

    var _this, bookmarked;
    var ShowDetail = Backbone.Marionette.ItemView.extend({
        template: '#show-detail-tpl',
        className: 'shows-container-contain',

        ui: {
            startStreaming: '#watch-now',
            q1080p: '#q1080',
            q720p: '#q720',
            q480p: '#q480',
            bookmarkIcon: '.favourites-toggle'
        },


        events: {
            'click .favourites-toggle': 'toggleFavorite',
            'click .show-watched-toggle': 'markShowAsWatched',
            'click .watched': 'toggleWatched',
            'click #watch-now': 'startStreaming',
            'click .close-icon': 'closeDetails',
            'click .tab-season': 'clickSeason',
            'click .tab-episode': 'clickEpisode',
            'click .show-imdb-link': 'openIMDb',
            'mousedown .show-magnet-link': 'openMagnet',
            'dblclick .tab-episode': 'dblclickEpisode',
            'click .q1080': 'toggleShowQuality',
            'click .q720': 'toggleShowQuality',
            'click .q480': 'toggleShowQuality',
            'click .playerchoicemenu li a': 'selectPlayer',
            'click .rating-container-tv': 'switchRating',
            'click .health-icon': 'resetHealth'
        },


        keyboardEvents: {
            'esc': 'closeDetails',
            'backspace': 'closeDetails',
            'q': 'toggleQuality',
            'enter': 'playEpisode',
            'space': 'playEpisode',
            'ctrl+up': 'previousSeason',
            'command+up': 'previousSeason',
            'ctrl+down': 'nextSeason',
            'command+down': 'nextSeason',
            'up': 'previousEpisode',
            'down': 'nextEpisode',
            'w': 'toggleEpisodeWatched',
            'f': 'toggleFavorite'
        },


        toggleFavorite: function (e) {

            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }
            var that = this;

            if (bookmarked !== true) {
                bookmarked = true;

                var provider = App.Providers.get(this.model.get('provider'));
                var data = provider.detail(this.model.get('imdb_id'), this.model.attributes)
                    .then(function (data) {
                            data.provider = that.model.get('provider');
                            Database.addTVShow(data)
                                .then(function (idata) {
                                    return Database.addBookmark(that.model.get('imdb_id'), 'tvshow');
                                })
                                .then(function () {
                                    win.info('Bookmark added (' + that.model.get('imdb_id') + ')');
                                    that.model.set('bookmarked', true);
                                    that.ui.bookmarkIcon.addClass('selected').text(i18n.__('Remove from bookmarks'));
                                    App.userBookmarks.push(that.model.get('imdb_id'));
                                });
                        },
                        function (err) {
                            $('.notification_alert').text(i18n.__('Error loading data, try again later...')).fadeIn('fast').delay(2500).fadeOut('fast');
                        });

            } else {
                that.ui.bookmarkIcon.removeClass('selected').text(i18n.__('Add to bookmarks'));
                bookmarked = false;

                Database.deleteBookmark(this.model.get('imdb_id'))
                    .then(function () {
                        win.info('Bookmark deleted (' + that.model.get('imdb_id') + ')');
                        that.model.set('bookmarked', false);
                        App.userBookmarks.splice(App.userBookmarks.indexOf(that.model.get('imdb_id')), 1);

                        // we'll make sure we dont have a cached show
                        Database.deleteTVShow(that.model.get('imdb_id'));
                        if (App.currentview === 'Favorites') {
                            App.vent.trigger('favorites:render');
                        }
                    });
            }
        },


        initialize: function () {
            _this = this;
            this.renameUntitled();

            App.vent.on('show:watched:' + this.model.id, _.bind(this.onWatched, this));
            App.vent.on('show:unwatched:' + this.model.id, _.bind(this.onUnWatched, this));

            var images = this.model.get('images');
            images.fanart = App.Trakt.resizeImage(images.fanart);
            images.poster = App.Trakt.resizeImage(images.poster, 'thumb');


        },
        renameUntitled: function () {
            var episodes = this.model.get('episodes');
            for (var i = 0; i < episodes.length; i++) {
                if (!episodes[i].title) {
                    episodes[i].title = 'Untitled';
                }
                if (!episodes[i].overview) {
                    episodes[i].overview = 'No overview available.';
                }
                if (!episodes[i].first_aired) {
                    episodes[i].first_aired = 'Unknown';
                }
            }
        },


        onShow: function () {


            bookmarked = App.userBookmarks.indexOf(this.model.get('imdb_id')) !== -1;

            if (bookmarked) {
                this.ui.bookmarkIcon.addClass('selected').text(i18n.__('Remove from bookmarks'));
            } else {
                this.ui.bookmarkIcon.removeClass('selected');
            }

            $('.star-container-tv,.show-imdb-link,.show-magnet-link').tooltip();

            var cbackground = $('.tv-cover').attr('data-bgr');
            var coverCache = new Image();
            coverCache.src = cbackground;
            coverCache.onload = function () {
                try {
                    $('.tv-cover')
                        .css('background-image', 'url(' + cbackground + ')')
                        .addClass('fadein');
                } catch (e) {}
                coverCache = null;
            };
            coverCache.onerror = function () {
                try {
                    $('.tv-cover')
                        .css('background-image', 'url("images/posterholder.png")')
                        .addClass('fadein');
                } catch (e) {}
                coverCache = null;
            };

            var background = $('.tv-poster-background').attr('data-bgr');
            var bgCache = new Image();
            bgCache.src = background;
            bgCache.onload = function () {
                try {
                    $('.tv-poster-background')
                        .css('background-image', 'url(' + background + ')')
                        .addClass('fadein');
                } catch (e) {}
                bgCache = null;
            };
            bgCache.onerror = function () {
                try {
                    $('.tv-poster-background')
                        .css('background-image', 'url("images/bg-header.jpg")')
                        .addClass('fadein');
                } catch (e) {}
                bgCache = null;
            };

            this.selectNextEpisode();

            if (!AdvSettings.get('ratingStars')) {
                $('.star-container-tv').addClass('hidden');
                $('.number-container-tv').removeClass('hidden');
            }

            this.isShowWatched();

            App.Device.Collection.setDevice(AdvSettings.get('chosenPlayer'));
            App.Device.ChooserView('#player-chooser').render();


        },

        selectNextEpisode: function () {

            var episodesSeen = [];
            Database.getEpisodesWatched(this.model.get('tvdb_id'))
                .then(function (data) {
                    _.each(data, function (value, state) {
                        // we'll mark episode already watched
                        _this.markWatched(value, true);
                        // store all watched episode
                        if (value) {
                            episodesSeen.push(parseInt(value.season) * 100 +
                                parseInt(value.episode));
                        }
                    });
                    var season = 1;
                    var episode = 1;
                    if (episodesSeen.length > 0) {
                        //get all episode
                        var episodes = [];
                        _.each(_this.model.get('episodes'),
                            function (value, currentepisode) {
                                episodes.push(parseInt(value.season) * 100 +
                                    parseInt(value.episode));
                            }
                        );
                        episodesSeen.sort(function (a, b) {
                            return a - b;
                        });
                        episodes.sort(function (a, b) {
                            return a - b;
                        });
                        var first = episodes[0];
                        var last = episodes[episodes.length - 1];
                        var unseen = episodes.filter(function (item) {
                            return episodesSeen.indexOf(item) === -1;
                        });
                        if (AdvSettings.get('tv_detail_jump_to') !== 'firstUnwatched') {
                            var lastSeen = episodesSeen[episodesSeen.length - 1];

                            if (lastSeen !== episodes[episodes.length - 1]) {
                                var idx;
                                _.find(episodes, function (data, dataIdx) {
                                    if (data === lastSeen) {
                                        idx = dataIdx;
                                        return true;
                                    }
                                });

                                if (!idx) {
                                    // switch back to firstUnwatched method if idx not found
                                    unseen.push(first);
                                    episode = unseen[0] % 100;
                                    season = (unseen[0] - episode) / 100;
                                } else {
                                    var next_episode = episodes[idx + 1];
                                    episode = next_episode % 100;
                                    season = (next_episode - episode) / 100;
                                }
                            } else {
                                episode = lastSeen % 100;
                                season = (lastSeen - episode) / 100;
                            }
                        } else {
                            //if all episode seend back to first
                            //it will be the only one
                            unseen.push(first);
                            episode = unseen[0] % 100;
                            season = (unseen[0] - episode) / 100;
                        }


                    }
                    if (season === 1 && episode === 1) {
                        // Workaround in case S01E01 doesn't exist in PT
                        // Select the first possible season
                        _this.selectSeason($('.tab-season:first'));
                    } else {
                        _this.selectSeason($('li[data-tab="season-' + season + '"]'));
                        var $episode = $('#watched-' + season + '-' + episode).parent();
                        _this.selectEpisode($episode);
                        if (!_this.isElementVisible($episode[0])) {
                            $episode[0].scrollIntoView(false);
                        }
                    }
                });
        },

        openIMDb: function () {
            gui.Shell.openExternal('http://www.imdb.com/title/' + this.model.get('imdb_id'));
        },

        openMagnet: function (e) {
            var torrentUrl = $('.startStreaming').attr('data-torrent');
            if (e.button === 2) { //if right click on magnet link
                var clipboard = gui.Clipboard.get();
                clipboard.set(torrentUrl, 'text'); //copy link to clipboard
                $('.notification_alert').text(i18n.__('The magnet link was copied to the clipboard')).fadeIn('fast').delay(2500).fadeOut('fast');
            } else {
                gui.Shell.openExternal(torrentUrl);
            }
        },

        switchRating: function () {
            if ($('.number-container-tv').hasClass('hidden')) {
                $('.number-container-tv').removeClass('hidden');
                $('.star-container-tv').addClass('hidden');
                AdvSettings.set('ratingStars', false);
            } else {
                $('.number-container-tv').addClass('hidden');
                $('.star-container-tv').removeClass('hidden');
                AdvSettings.set('ratingStars', true);
            }
        },

        toggleWatched: function (e) {
            var edata = e.currentTarget.id.split('-');
            setTimeout(function () {
                var value = {
                    tvdb_id: _this.model.get('tvdb_id'),
                    imdb_id: _this.model.get('imdb_id'),
                    episode_id: $('#watch-now').attr('data-episodeid'),
                    season: edata[1],
                    episode: edata[2],
                    from_browser: true
                };

                Database.checkEpisodeWatched(value)
                    .then(function (watched) {
                        if (watched) {
                            App.vent.trigger('show:unwatched', value, 'seen');
                        } else {
                            App.vent.trigger('show:watched', value, 'seen');
                        }
                    });
            }, 100);
        },

        isShowWatched: function () {
            var tvdb_id = _this.model.get('tvdb_id');
            var imdb_id = _this.model.get('imdb_id');

            var episodes = this.model.get('episodes');
            episodes.forEach(function (episode, index, array) {
                var value = {
                    tvdb_id: tvdb_id,
                    imdb_id: imdb_id,
                    season: episode.season,
                    episode: episode.episode,
                    from_browser: true
                };
                Database.checkEpisodeWatched(value)
                    .then(function (watched) {
                        if (!watched) {
                            $('.show-watched-toggle').show();
                        }
                    });
            });
        },

        markShowAsWatched: function () {
            $('.show-watched-toggle').addClass('selected');

            var tvdb_id = _this.model.get('tvdb_id');
            var imdb_id = _this.model.get('imdb_id');

            var episodes = _this.model.get('episodes');
            episodes.forEach(function (episode, index, array) {
                var value = {
                    tvdb_id: tvdb_id,
                    imdb_id: imdb_id,
                    episode_id: episode.tvdb_id,
                    season: episode.season,
                    episode: episode.episode,
                    from_browser: true
                };
                Database.checkEpisodeWatched(value)
                    .then(function (watched) {
                        if (!watched) {
                            App.vent.trigger('show:watched', value, 'seen');
                            $('.show-watched-toggle').hide();
                        }
                    });
            });
        },

        onWatched: function (value, channel) {
            this.markWatched(value, true);

            this.selectNextEpisode();
        },

        onUnWatched: function (value, channel) {
            this.markWatched(value, false);
        },

        markWatched: function (value, state) {
            state = (state === undefined) ? true : state;
            // we should never get any shows that aren't us, but you know, just in case.
            if (value.tvdb_id === _this.model.get('tvdb_id')) {
                $('#watched-' + value.season + '-' + value.episode).toggleClass('true', state);
            } else {
                win.error('something fishy happened with the watched signal', this.model, value);
            }
        },

        startStreaming: function (e) {

            if (e.type) {
                e.preventDefault();
            }
            var that = this;
            var title = that.model.get('title');
            var episode = $(e.currentTarget).attr('data-episode');
            var episode_id = $(e.currentTarget).attr('data-episodeid');
            var season = $(e.currentTarget).attr('data-season');
            var name = $(e.currentTarget).attr('data-title');

            var episodes = [];
            var episodes_data = [];
            var selected_quality = $(e.currentTarget).attr('data-quality');

            if (AdvSettings.get('playNextEpisodeAuto') && this.model.get('imdb_id').indexOf('mal') === -1) {
                _.each(this.model.get('episodes'), function (value) {
                    var epaInfo = {
                        id: parseInt(value.season) * 100 + parseInt(value.episode),
                        title: value.title,
                        torrents: value.torrents,
                        season: value.season,
                        episode: value.episode,
                        episode_id: value.tvdb_id,
                        tvdb_id: that.model.get('tvdb_id'),
                        imdb_id: that.model.get('imdb_id')
                    };
                    episodes_data.push(epaInfo);
                    episodes.push(parseInt(value.season) * 100 + parseInt(value.episode));
                });
                episodes.sort();
                episodes_data = _.sortBy(episodes_data, 'id');

            } else {
                episodes = null;
                episodes_data = null;
            }

            var torrentStart = {
                torrent: $(e.currentTarget).attr('data-torrent'),
                type: 'show',
                metadata: {
                    title: title + ' - ' + i18n.__('Season') + ' ' + season + ', ' + i18n.__('Episode') + ' ' + episode + ' - ' + name,
                    showName: title,
                    season: season,
                    episode: episode,
                    cover: that.model.get('images').poster,
                    tvdb_id: that.model.get('tvdb_id'),
                    episode_id: episode_id,
                    imdb_id: that.model.get('imdb_id'),
                    backdrop: that.model.get('images').fanart,
                    quality: selected_quality
                },
                autoPlayData: {
                    episodes: episodes,
                    streamer: 'main',
                    episodes_data: episodes_data
                },
                status: that.model.get('status'),
                device: App.Device.Collection.selected
            };

            App.Streamer.start(torrentStart);
        },
        closeDetails: function (e) {
            App.vent.trigger('show:closeDetail');
        },

        clickSeason: function (e) {
            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.selectSeason($(e.currentTarget));
        },

        clickEpisode: function (e) {
            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.selectEpisode($(e.currentTarget));
        },

        dblclickEpisode: function (e) {
            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.selectEpisode($(e.currentTarget));
            $('.startStreaming').trigger('click');
        },
        // Helper Function
        selectSeason: function ($elem) {
            $('.tab-season.active').removeClass('active');
            $elem.addClass('active');
            $('.tab-episodes').hide();
            $('.tab-episodes.current').removeClass('current');
            $('.tab-episode.active').removeClass('active');
            $('.tab-episodes.' + $elem.attr('data-tab')).addClass('current').scrollTop(0).show(); //pull the scroll always to top to
            this.selectEpisode($('.tab-episodes.' + $elem.attr('data-tab') + ' li:first'));
        },

        selectEpisode: function ($elem) {
            if ($elem.length === 0) {
                return;
            }
            var tvdbid = $elem.attr('data-id');
            var torrents = {};
            var quality;
            torrents.q480 = $('.template-' + tvdbid + ' .q480').text();

            torrents.q720 = $('.template-' + tvdbid + ' .q720').text();
            torrents.q1080 = $('.template-' + tvdbid + ' .q1080').text();
            this.ui.q1080p.removeClass('active');
            this.ui.q720p.removeClass('active');
            this.ui.q480p.removeClass('active');


            if (!torrents.q480) {
                this.ui.q480p.addClass('disabled');
            } else {
                this.ui.q480p.removeClass('disabled');
            }
            if (!torrents.q720) {
                this.ui.q720p.addClass('disabled');
            } else {
                this.ui.q720p.removeClass('disabled');
            }
            if (!torrents.q1080) {
                this.ui.q1080p.addClass('disabled');
            } else {
                this.ui.q1080p.removeClass('disabled');
            }

            switch (Settings.shows_default_quality) {
            case '1080p':
                if (torrents.q1080) {
                    quality = '1080p';
                } else if (torrents.q720) {
                    quality = '720p';
                } else if (torrents.q480) {
                    quality = '480p';
                }
                break;
            case '720p':
                if (torrents.q720) {
                    quality = '720p';
                } else if (torrents.q480) {
                    quality = '480p';
                } else if (torrents.q1080) {
                    quality = '1080p';
                }
                break;
            case '480p':
                if (torrents.q480) {
                    quality = '480p';
                } else if (torrents.q720) {
                    quality = '720p';
                } else if (torrents.q1080) {
                    quality = '1080p';
                }
                break;
            }


            // Select quality
            if (quality === '1080p') {
                torrents.def = torrents.q1080;
                torrents.quality = '1080p';
                this.ui.q1080p.addClass('active');
            } else if (quality === '720p') {
                torrents.def = torrents.q720;
                torrents.quality = '720p';
                this.ui.q720p.addClass('active');
            } else {
                torrents.def = torrents.q480;
                torrents.quality = '480p';
                this.ui.q480p.addClass('active');
            }


            $('.tab-episode.active').removeClass('active');
            $elem.addClass('active');
            $('.episode-info-number').text(i18n.__('Season %s', $('.template-' + tvdbid + ' .season').html()) + ', ' + i18n.__('Episode %s', $('.template-' + tvdbid + ' .episode').html()));
            $('.episode-info-title').text($('.template-' + tvdbid + ' .title').text());
            $('.episode-info-date').text(i18n.__('Aired Date') + ': ' + $('.template-' + tvdbid + ' .date').html());
            $('.episode-info-description').text($('.template-' + tvdbid + ' .overview').text());

            //pull the scroll always to top
            $('.episode-info-description').scrollTop(0);

            $('.startStreaming').attr('data-torrent', torrents.def);
            $('.startStreaming').attr('data-quality', torrents.quality);
            $('.startStreaming').attr('data-episodeid', tvdbid);

            // set var for player
            $('.startStreaming').attr('data-episode', $('.template-' + tvdbid + ' .episode').html());
            $('.startStreaming').attr('data-season', $('.template-' + tvdbid + ' .season').html());
            $('.startStreaming').attr('data-title', $('.template-' + tvdbid + ' .title').html());

            _this.resetHealth();

            this.ui.startStreaming.show();
        },
        toggleShowQuality: function (e) {
            if ($(e.currentTarget).hasClass('disabled')) {
                return;
            }
            var quality = $(e.currentTarget);

            this.ui.q1080p.removeClass('active');
            this.ui.q720p.removeClass('active');
            this.ui.q480p.removeClass('active');
            $(e.currentTarget).addClass('active');

            var tvdbid = $('.startStreaming').attr('data-episodeid'),
                torrent = $('.template-' + tvdbid + ' .' + quality.attr('id')).text();
            $('.startStreaming').attr('data-torrent', torrent);
            $('.startStreaming').attr('data-quality', quality.text());
            AdvSettings.set('shows_default_quality', quality.text());
            _this.resetHealth();
        },
        toggleQuality: function (e) {
            var qualities = {
                q480p: {
                    active: _this.ui.q480p.hasClass('active'),
                    next: 'q720p'
                },
                q720p: {
                    active: _this.ui.q720p.hasClass('active'),
                    next: 'q1080p'
                },
                q1080p: {
                    active: _this.ui.q1080p.hasClass('active'),
                    next: 'q480p'
                },
            };

            for (var q in qualities) {
                if (qualities[q].active) {
                    var fake_e = {};
                    fake_e.currentTarget = $(_this.ui[qualities[q].next]);
                    _this.toggleShowQuality(fake_e);
                }
            }
        },

        nextEpisode: function (e) {
            var index = $('.tab-episode.active').index();
            if (index === $('.tab-episode:visible').length - 1) {
                return;
            }
            var $nextEpisode = $('.tab-episode:visible').eq(++index);
            _this.selectEpisode($nextEpisode);
            if (!_this.isElementVisible($nextEpisode[0])) {
                $nextEpisode[0].scrollIntoView(false);
            }

            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }

        },

        previousEpisode: function (e) {
            var index = $('.tab-episode.active').index();
            if (index === 0) {
                return;
            }
            var $prevEpisode = $('.tab-episode:visible').eq(--index);
            _this.selectEpisode($prevEpisode);
            if (!_this.isElementVisible($prevEpisode[0])) {
                $prevEpisode[0].scrollIntoView(true);
            }

            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }

        },

        nextSeason: function (e) {
            var index = $('.tab-season.active').index();
            if (index === $('.tab-season').length - 1) {
                return;
            }
            var $nextSeason = $('.tab-season').eq(++index);
            _this.selectSeason($nextSeason);
            if (!_this.isElementVisible($nextSeason[0])) {
                $nextSeason[0].scrollIntoView(false);
            }

            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }
        },

        previousSeason: function (e) {
            var index = $('.tab-season.active').index();
            if (index === 0) {
                return;
            }
            var $prevSeason = $('.tab-season').eq(--index);
            _this.selectSeason($prevSeason);
            if (!_this.isElementVisible($prevSeason[0])) {
                $prevSeason[0].scrollIntoView(true);
            }

            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }

        },

        playEpisode: function (e) {
            $('.startStreaming').trigger('click');

            if (e.type) {
                e.preventDefault();
                e.stopPropagation();
            }
        },

        toggleEpisodeWatched: function (e) {
            var data = {};
            data.currentTarget = $('.tab-episode.active .watched')[0];
            _this.toggleWatched(data);
        },


        isElementVisible: function (el) {
            var eap,
                rect = el.getBoundingClientRect(),
                docEl = document.documentElement,
                vWidth = window.innerWidth || docEl.clientWidth,
                vHeight = window.innerHeight || docEl.clientHeight,
                efp = function (x, y) {
                    return document.elementFromPoint(x, y);
                },
                contains = 'contains' in el ? 'contains' : 'compareDocumentPosition',
                has = contains === 'contains' ? 1 : 0x14;

            // Return false if it's not in the viewport
            if (rect.right < 0 || rect.bottom < 0 || rect.left > vWidth || rect.top > vHeight) {
                return false;
            }

            // Return true if any of its four corners are visible
            return (
                (eap = efp(rect.left, rect.top)) === el || el[contains](eap) === has || (eap = efp(rect.right, rect.top)) === el || el[contains](eap) === has || (eap = efp(rect.right, rect.bottom)) === el || el[contains](eap) === has || (eap = efp(rect.left, rect.bottom)) === el || el[contains](eap) === has
            );
        },

        getTorrentHealth: function (e) {
            var torrent = $('.startStreaming').attr('data-torrent');

            cancelTorrentHealth();

            // Use fancy coding to cancel
            // pending torrent-tracker-health's
            var cancelled = false;
            cancelTorrentHealth = function () {
                cancelled = true;
            };

            if (torrent.substring(0, 8) === 'magnet:?') {
                // if 'magnet:?' is because TVApi sends back links, not magnets

                torrent = torrent.split('&tr')[0] + '&tr=udp://tracker.openbittorrent.com:80/announce' + '&tr=udp://open.demonii.com:1337/announce' + '&tr=udp://tracker.coppersurfer.tk:6969';

                torrentHealth(torrent, {
                    timeout: 1000
                }).then(function (res) {

                    if (cancelled) {
                        return;
                    }
                    if (res.seeds === 0 && torrentHealthRestarted < 5) {
                        torrentHealthRestarted++;
                        $('.health-icon').click();
                    } else {
                        torrentHealthRestarted = 0;
                        var h = Common.calcHealth({
                            seed: res.seeds,
                            peer: res.peers
                        });
                        var health = Common.healthMap[h].capitalize();
                        var ratio = res.peers > 0 ? res.seeds / res.peers : +res.seeds;

                        $('.health-icon').tooltip({
                            html: true
                        })
                            .removeClass('Bad Medium Good Excellent')
                            .addClass(health)
                            .attr('data-original-title', i18n.__('Health ' + health) + ' - ' + i18n.__('Ratio:') + ' ' + ratio.toFixed(2) + ' <br> ' + i18n.__('Seeds:') + ' ' + res.seeds + ' - ' + i18n.__('Peers:') + ' ' + res.peers)
                            .tooltip('fixTitle');
                    }
                });
            }
        },

        resetHealth: function () {
            $('.health-icon').tooltip({
                html: true
            })
                .removeClass('Bad Medium Good Excellent')
                .attr('data-original-title', i18n.__('Health Unknown'))
                .tooltip('fixTitle');
            this.getTorrentHealth();
        },

        selectPlayer: function (e) {
            var player = $(e.currentTarget).parent('li').attr('id').replace('player-', '');
            _this.model.set('device', player);
            if (!player.match(/[0-9]+.[0-9]+.[0-9]+.[0-9]/ig)) {
                AdvSettings.set('chosenPlayer', player);
            }
        }

    });

    App.View.ShowDetail = ShowDetail;
})(window.App);
