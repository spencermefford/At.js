
/*
  Implement Github like autocomplete mentions
  http://ichord.github.com/At.js

  Copyright (c) 2013 chord.luo@gmail.com
  Licensed under the MIT license.
*/


(function() {
  var __slice = [].slice;

  (function(factory) {
    if (typeof define === 'function' && define.amd) {
      return define(['jquery'], factory);
    } else {
      return factory(window.jQuery);
    }
  })(function($) {
    var $CONTAINER, Api, Controller, DEFAULT_CALLBACKS, DEFAULT_TPL, KEY_CODE, Model, View;
    KEY_CODE = {
      DOWN: 40,
      UP: 38,
      ESC: 27,
      TAB: 9,
      ENTER: 13
    };
    DEFAULT_CALLBACKS = {
      loading_data: function(data) {
        if (!$.isArray(data)) {
          return data;
        }
        return $.map(data, function(item, k) {
          if (!$.isPlainObject(item)) {
            item = {
              name: item
            };
          }
          return item;
        });
      },
      matcher: function(flag, subtext) {
        var match, matched, regexp;
        flag = " " + flag.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
        regexp = new RegExp(flag + '([A-Za-z0-9_\+\-]*)$|' + flag + '([^\\x00-\\xff]*)$', 'gi');
        match = regexp.exec(subtext);
        matched = null;
        if (match) {
          matched = match[2] ? match[2] : match[1];
        }
        return matched;
      },
      filter: function(query, data, search_key) {
        var _this = this;
        return $.map(data, function(item, i) {
          var name;
          name = $.isPlainObject(item) ? item[search_key] : item;
          if (name.toLowerCase().indexOf(query) >= 0) {
            return item;
          }
        });
      },
      remote_filter: null,
      sorter: function(query, items, search_key) {
        var item, results, text, _i, _len;
        if (!query) {
          return items.sort(function(a, b) {
            if (a[search_key].toLowerCase() > b[search_key].toLowerCase()) {
              return 1;
            } else {
              return -1;
            }
          });
        }
        results = [];
        for (_i = 0, _len = items.length; _i < _len; _i++) {
          item = items[_i];
          text = item[search_key];
          item.atwho_order = text.toLowerCase().indexOf(query);
          results.push(item);
        }
        results.sort(function(a, b) {
          return a.atwho_order - b.atwho_order;
        });
        return results = (function() {
          var _j, _len1, _results;
          _results = [];
          for (_j = 0, _len1 = results.length; _j < _len1; _j++) {
            item = results[_j];
            delete item["atwho_order"];
            _results.push(item);
          }
          return _results;
        })();
      },
      tpl_eval: function(tpl, map) {
        var el;
        try {
          return el = tpl.replace(/\$\{([^\}]*)\}/g, function(tag, key, pos) {
            return map[key];
          });
        } catch (error) {
          return "";
        }
      },
      highlighter: function(li, query) {
        if (!query) {
          return li;
        }
        return li.replace(new RegExp(">\\s*(\\w*)(" + query.replace("+", "\\+") + ")(\\w*)\\s*<", 'ig'), function(str, $1, $2, $3) {
          return '> ' + $1 + '<strong>' + $2 + '</strong>' + $3 + ' <';
        });
      },
      selector: function($li) {
        if ($li.length > 0) {
          return this.replace_str($li.data("value") || "");
        }
      }
    };
    Model = (function() {
      var _storage;

      _storage = {};

      function Model(context, key) {
        this.context = context;
        this.key = key;
      }

      Model.prototype.saved = function() {
        return this.fetch() > 0;
      };

      Model.prototype.query = function(query, callback) {
        var data, remote_filter, search_key;
        data = this.fetch();
        search_key = this.context.get_opt("search_key");
        data = this.context.callbacks('filter').call(this.context, query, data, search_key);
        if (data && data.length > 0) {
          callback(data);
        } else if ((remote_filter = this.context.callbacks('remote_filter'))) {
          remote_filter.call(this.context, query && query.text, callback);
        } else {
          return false;
        }
        return true;
      };

      Model.prototype.fetch = function() {
        return _storage[this.key] || [];
      };

      Model.prototype.save = function(data) {
        return _storage[this.key] = this.context.callbacks("loading_data").call(this.context, data);
      };

      Model.prototype.load = function(data) {
        var _this = this;
        if (this.saved()) {
          return;
        }
        if (typeof data === "string") {
          return $.ajax(url, {
            dataType: "json"
          }).done(function(data) {
            return _this.save(data);
          });
        } else {
          return this.save(data);
        }
      };

      return Model;

    })();
    Controller = (function() {
      var uuid, _uuid;

      _uuid = 0;

      uuid = function() {
        return _uuid += 1;
      };

      function Controller(inputor) {
        this.id = inputor.id || uuid();
        this.settings = {};
        this.pos = 0;
        this.current_flag = null;
        this.query = null;
        this.the_flag = {};
        this._views = {};
        this._models = {};
        this.$inputor = $(inputor);
        this.create_ground();
        this.listen();
      }

      Controller.prototype.create_ground = function() {
        this.$el = $("<div id='atwho-ground-" + this.id + "'></div>");
        return $CONTAINER.append(this.$el);
      };

      Controller.prototype.listen = function() {
        var _this = this;
        return this.$inputor.on('keyup.atwho', function(e) {
          return _this.on_keyup(e);
        }).on('keydown.atwho', function(e) {
          return _this.on_keydown(e);
        }).on('scroll.atwho', function(e) {
          return _this.view.hide();
        }).on('blur.atwho', function(e) {
          return _this.view.hide(_this.get_opt("display_timeout"));
        });
      };

      Controller.prototype.set_context_for = function(flag) {
        flag = this.current_flag = this.the_flag[flag];
        this.view = this._views[flag];
        this.model = this._models[flag];
        return this;
      };

      Controller.prototype.reg = function(flag, settings) {
        var setting;
        if (this.settings[flag]) {
          setting = this.settings[flag] = $.extend({}, this.settings[flag], settings);
        } else {
          setting = this.settings[flag] = $.extend({}, $.fn.atwho["default"], settings);
        }
        flag = (setting.alias ? this.the_flag[setting.alias] = flag : void 0, this.the_flag[flag] = flag);
        this.set_context_for(flag);
        (this._models[flag] = new Model(this, flag)).load(setting.data);
        this._views[flag] = new View(this, flag);
        return this;
      };

      Controller.prototype.trigger = function(name, data) {
        var alias, event_name;
        data || (data = []);
        data.push(this);
        alias = this.get_opt('alias');
        event_name = alias ? "" + name + "-" + alias + ".atwho" : "" + name + ".atwho";
        return this.$inputor.trigger(event_name, data);
      };

      Controller.prototype.super_call = function() {
        var args, func_name;
        func_name = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
        try {
          return DEFAULT_CALLBACKS[func_name].apply(this, args);
        } catch (error) {
          return $.error("" + error + " Or maybe At.js doesn't have function " + func_name);
        }
      };

      Controller.prototype.callbacks = function(func_name) {
        var func;
        func = this.get_opt("callbacks")[func_name];
        if (!func) {
          func = DEFAULT_CALLBACKS[func_name];
        }
        return func;
      };

      Controller.prototype.get_opt = function(key, default_value) {
        try {
          return this.settings[this.current_flag][key];
        } catch (e) {
          return null;
        }
      };

      Controller.prototype.rect = function() {
        var c, scale, scale_bottom;
        c = this.$inputor.caret('offset', this.pos - 1);
        if (document.selection) {
          scale_bottom = scale = 0;
        } else {
          scale = 0;
          scale_bottom = 2;
        }
        return {
          left: c.left + scale,
          top: c.top + scale,
          bottom: c.top + c.height + scale_bottom
        };
      };

      Controller.prototype.catch_query = function() {
        var alias, caret_pos, content, end, query, start, subtext,
          _this = this;
        content = this.$inputor.val();
        caret_pos = this.$inputor.caret('pos');
        subtext = content.slice(0, caret_pos);
        query = null;
        $.each(this.settings, function(flag, settings) {
          query = _this.callbacks("matcher").call(_this, flag, subtext);
          if (query != null) {
            _this.set_context_for(flag);
            return false;
          }
        });
        if (typeof query === "string" && query.length <= 20) {
          start = caret_pos - query.length;
          end = start + query.length;
          this.pos = start;
          query = {
            'text': query.toLowerCase(),
            'head_pos': start,
            'end_pos': end
          };
          alias = this.get_opt('alias');
          this.trigger("matched", [this.current_flag, query.text]);
        } else {
          this.view.hide();
        }
        return this.query = query;
      };

      Controller.prototype.replace_str = function(str) {
        var $inputor, flag_len, source, start_str, text;
        $inputor = this.$inputor;
        str = '' + str;
        source = $inputor.val();
        flag_len = this.get_opt("display_flag") ? 0 : this.current_flag.length;
        start_str = source.slice(0, (this.query['head_pos'] || 0) - flag_len);
        text = "" + start_str + str + " " + (source.slice(this.query['end_pos'] || 0));
        $inputor.val(text);
        $inputor.caret('pos', start_str.length + str.length + 1);
        return $inputor.change();
      };

      Controller.prototype.on_keyup = function(e) {
        switch (e.keyCode) {
          case KEY_CODE.ESC:
            e.preventDefault();
            this.view.hide();
            break;
          case KEY_CODE.DOWN:
          case KEY_CODE.UP:
            $.noop();
            break;
          default:
            this.look_up();
        }
      };

      Controller.prototype.on_keydown = function(e) {
        if (!this.view.visible()) {
          return;
        }
        switch (e.keyCode) {
          case KEY_CODE.ESC:
            e.preventDefault();
            this.view.hide();
            break;
          case KEY_CODE.UP:
            e.preventDefault();
            this.view.prev();
            break;
          case KEY_CODE.DOWN:
            e.preventDefault();
            this.view.next();
            break;
          case KEY_CODE.TAB:
          case KEY_CODE.ENTER:
            if (!this.view.visible()) {
              return;
            }
            e.preventDefault();
            this.view.choose();
            break;
          default:
            $.noop();
        }
      };

      Controller.prototype.render_view = function(data) {
        var search_key;
        search_key = this.get_opt("search_key");
        data = this.callbacks("sorter").call(this, this.query.text, data, search_key);
        data = data.slice(0, this.get_opt('limit'));
        return this.view.render(data);
      };

      Controller.prototype.look_up = function() {
        var query, _callback;
        query = this.catch_query();
        if (!query) {
          return;
        }
        _callback = function(data) {
          if (data) {
            return this.render_view(data);
          } else {
            return this.view.hide();
          }
        };
        _callback = $.proxy(_callback, this);
        if (!this.model.query(query.text, _callback)) {
          return this.view.hide();
        }
      };

      return Controller;

    })();
    View = (function() {

      function View(context, key) {
        this.context = context;
        this.key = key;
        this.id = this.context.get_opt("alias") || ("at-view-" + (this.key.charCodeAt(0)));
        this.$el = $("<div id='" + this.id + "' class='atwho-view'><ul id='" + this.id + "-ul' class='atwho-view-url'></ul></div>");
        this.timeout_id = null;
        this.create_view();
        this.bind_event();
      }

      View.prototype.create_view = function() {
        return this.context.$el.append(this.$el);
      };

      View.prototype.bind_event = function() {
        var $menu,
          _this = this;
        $menu = this.$el.find('ul');
        return $menu.on('mouseenter.view', 'li', function(e) {
          $menu.find('.cur').removeClass('cur');
          return $(e.currentTarget).addClass('cur');
        }).on('click', function(e) {
          _this.choose();
          return e.preventDefault();
        });
      };

      View.prototype.visible = function() {
        return this.$el.is(":visible");
      };

      View.prototype.choose = function() {
        var $li;
        $li = this.$el.find(".cur");
        this.context.callbacks("selector").call(this.context, $li);
        this.context.trigger("choose", [$li]);
        return this.hide();
      };

      View.prototype.reposition = function() {
        var offset, rect;
        rect = this.context.rect();
        if (rect.bottom + this.$el.height() - $(window).scrollTop() > $(window).height()) {
          rect.bottom = rect.top - this.$el.height();
        }
        offset = {
          left: rect.left,
          top: rect.bottom
        };
        this.$el.offset(offset);
        return this.context.trigger("reposition", [offset]);
      };

      View.prototype.next = function() {
        var cur, next;
        cur = this.$el.find('.cur').removeClass('cur');
        next = cur.next();
        if (!next.length) {
          next = $(this.$el.find('li')[0]);
        }
        return next.addClass('cur');
      };

      View.prototype.prev = function() {
        var cur, prev;
        cur = this.$el.find('.cur').removeClass('cur');
        prev = cur.prev();
        if (!prev.length) {
          prev = this.$el.find('li').last();
        }
        return prev.addClass('cur');
      };

      View.prototype.show = function() {
        if (!this.visible()) {
          this.$el.show();
        }
        return this.reposition();
      };

      View.prototype.hide = function(time) {
        var callback,
          _this = this;
        if (isNaN(time)) {
          if (this.visible()) {
            return this.$el.hide();
          }
        } else {
          callback = function() {
            return _this.hide();
          };
          clearTimeout(this.timeout_id);
          return this.timeout_id = setTimeout(callback, time);
        }
      };

      View.prototype.clear = function() {
        return this.$el.find('ul').empty();
      };

      View.prototype.render = function(list) {
        var $ul, tpl,
          _this = this;
        if (!$.isArray(list)) {
          return false;
        }
        if (list.length <= 0) {
          this.hide();
          return true;
        }
        this.clear();
        $ul = this.$el.find('ul');
        tpl = this.context.get_opt('tpl', DEFAULT_TPL);
        $.each(list, function(i, item) {
          var $li, li;
          li = _this.context.callbacks("tpl_eval").call(_this.context, tpl, item);
          $li = $(_this.context.callbacks("highlighter").call(_this.context, li, _this.context.query.text));
          $li.data("info", item);
          return $ul.append($li);
        });
        this.show();
        return $ul.find("li:eq(0)").addClass("cur");
      };

      return View;

    })();
    DEFAULT_TPL = "<li data-value='${name}'>${name}</li>";
    Api = {
      init: function(options) {
        var $this, data;
        $this = $(this);
        data = $this.data("atwho");
        if (!data) {
          $this.data('atwho', (data = new Controller(this)));
        }
        return data.reg(options.at, options);
      },
      load: function(flag, data) {
        this.set_context_for(flag);
        return this.model.load(data);
      }
    };
    $CONTAINER = $("<div id='atwho-container'></div>");
    $.fn.atwho = function(method) {
      var _args;
      _args = arguments;
      $('body').append($CONTAINER);
      return this.filter('textarea, input').each(function() {
        if (typeof method === 'object' || !method) {
          return Api.init.apply(this, _args);
        } else if (Api[method]) {
          return Api[method].apply($(this).data('atwho'), Array.prototype.slice.call(_args, 1));
        } else {
          return $.error("Method " + method + " does not exist on jQuery.caret");
        }
      });
    };
    return $.fn.atwho["default"] = {
      at: void 0,
      alias: void 0,
      data: null,
      tpl: DEFAULT_TPL,
      callbacks: DEFAULT_CALLBACKS,
      search_key: "name",
      limit: 5,
      display_flag: true,
      display_timeout: 300
    };
  });

}).call(this);
