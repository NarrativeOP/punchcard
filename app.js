/* jshint esnext: true */
var CLIENT_ID = 'ucTPGCIfkZIjkbAcMerXjKmvjTzHr6hz0avfBFgm';

var getHashVars = function() {
  if (window.location.hash) {
    return window.location.hash.split('#')[1].split('&').reduce((params, str) => {
      parts = str.split('=');
      params[parts[0]] = parts[1];
      return params;
    }, {});
  } else {
    return {};
  }
};

var getLogin = function() {
  var hashVars = getHashVars();
  if (hashVars.hasOwnProperty('access_token')) {
    return hashVars.access_token;
  } else {
    var redirect_uri = window.location.origin + window.location.pathname;
    window.location = 'https://narrativeapp.com/oauth2/authorize?response_type=token&client_id=' + CLIENT_ID + '&redirect_uri=' + redirect_uri;
  }
};

var throttledFetch = (url, data) => {
  return fetch(url, data).then((r) => {
    return new Promise((resolve, reject) => {
      if (r.status == 429) {
        setTimeout(() => {
          throttledFetch(url, data).then(resolve);
        }, 1000);
      } else {
        resolve(r);
      }
    });
  });
};

var fetchAll = function(baseURL, stored, trackProgress) {
  if (!stored) {
    stored = {
      next: baseURL,
      results: [],
    };
  }
  return throttledFetch(stored.next, 
        {headers: {'Authorization': 'Bearer ' + getLogin()}}).then(r => r.json()).then(data => {
          stored.results = stored.results.concat(data.results);
          stored.next = data.next;
          if (trackProgress) {
            trackProgress(stored.results);
          }
          if (stored.next) {
            return fetchAll(null, stored, trackProgress);
          } else {
            return new Promise((resolve, reject) => {
              resolve(stored.results);
            });
          }
        });
};
var photoProgress = new ProgressBar.Circle('#photo-progress', {
  color: '#e45f5d',
  strokeWidth: 10,
  fill: '#f2f3f4',
  text: {
    value: 'Photos'
  },
});

var loadData = function() {
  if (window.localStorage.photos) {
    var photos = JSON.parse(window.localStorage.photos);
    window.photos = photos;
    return new Promise((resolve, reject) => {
      resolve(photos);
    });
  }
  return fetch('https://narrativeapp.com/api/v2/users/me/', 
        {headers: {'Authorization': 'Bearer ' + getLogin()}}).then(r => r.json()).then(userData => {
          var totalPhotos = userData.statistics.photo_count;
          trackProgress = function(photos) {
            var loadedPhotos = Math.min(photos.length / totalPhotos, 1);
            photoProgress.animate(loadedPhotos);
          };
          return fetchAll('https://narrativeapp.com/api/v2/photos/?limit=1000&fields=taken_at_local', undefined, trackProgress).then(p => {
            p = p.map((o) => {
              return {
                t: o.taken_at_local,
              };
            });
            window.photos = p;
            if (JSON.stringify(p).length < 5200000) {
              // Can store longer strings in localstorage
              window.localStorage.photos = JSON.stringify(p);
            }
            return new Promise((resolve, reject) => {
              resolve(p);
            });
          });
        });
};

Array.prototype.groupBy = function(grouper) {
  return this.reduce((groups, obj) => {
    var key = grouper(obj);
    if (groups.hasOwnProperty(key)) {
      groups[key].push(obj);
    } else {
      groups[key] = [obj];
    }
    return groups;
  }, {});
};

var drawPunchChart = (data) => {
  var fullWidth = document.getElementById('graph').offsetWidth;
  var graphPadding = 80;
  var width = (fullWidth-graphPadding);
  var fullHeight = 380;
  var height = (fullHeight-40);
  var days = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday"
  ];
  var hours = [
    "12am", "1am", "2am", "3am", "4am", "5am", "6am", "7am", "8am",
    "9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm",
    "6pm", "7pm", "8pm", "9pm", "10pm", "11pm"
  ];


  var palette = d3.select("#graph").append("svg").
    attr("width", fullWidth).
    attr("height", fullHeight);

  var dayGroup = palette.append("g");
  var hourGroup = palette.append("g");
  var circleGroup = palette.append("g");

  x = {
    min: 0,
    max: width,
  };
  x.step = x.max/24;

  y = {
    min: 0,
    max: height,
  };
  y.step = y.max/7;
  var dayText = dayGroup.selectAll("text")
  .data(days)
  .enter()
  .append("text");
  var dayLabels = dayText
  .attr("x", 0)
  .attr("y", function(d) { return y.step*(days.indexOf(d)+1); })
  .text(function (d) { return d; })
  .attr("font-family", "sans-serif")
  .attr("font-size", "12px");

  var hourText = hourGroup.selectAll("text")
  .data(hours)
  .enter()
  .append("text");
  var hourLabels = hourText
  .attr("x", function(d) {
    return x.step*(hours.indexOf(d)+1)+32;
  })
  .attr("y", y.max+30)
  .text(function (d) { return d; })
  .attr("font-family", "sans-serif")
  .attr("font-size", "12px");

  var scaleData = [];

  var i;

  for (i in data) {
    scaleData.push(data[i][2]);
  }

  z = {
    data: scaleData
  };
  z.max    = d3.max(z.data);
  z.min    = d3.min(z.data);
  z.domain = [z.min, z.max];
  z.range  = [4, 15];
  z.scale  = d3.scale.linear().
    domain(z.domain).
    range(z.range);

  for (i in data) {
    tuple = data[i];
    commits = tuple[2];
    if (commits > 0) {
      cy    = y.step*(tuple[0]+1);
      cx    = x.step*(tuple[1]+1)+50;
      r     = z.scale(commits);

      c = circleGroup.append("circle")
      .attr("cx",cx)
      .attr("cy",cy)
      .attr("r",r)
      .attr("class","hover-circle");

    }
  }

};


var main = function() {
  loadData().then(photos => {
    document.getElementById('loading').remove();
    document.getElementById('graph-wrapper').style.display = 'block';
    var dates = photos.map((photo) => {
      return new Date(photo.t);
    });
    var daysHours = dates.groupBy((obj) => obj.getDay() + '_' + obj.getHours());
    var data = Object.keys(daysHours).map((k) => {
      return k.split('_').map((s) => parseInt(s)).concat(daysHours[k].length);
    });
    drawPunchChart(data);
  });
};

main();
