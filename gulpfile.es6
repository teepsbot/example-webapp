import gulp from 'gulp'
import gutil from 'gulp-util'
import sequence from 'run-sequence'
import plumber from 'gulp-plumber'
import source from 'vinyl-source-stream'
import del from 'del'
import fs from 'fs'
import path from 'path'

// Notifications
import notify from 'gulp-notify'

// Style things
import postcss from 'gulp-postcss'
import autoprefixer from 'autoprefixer'
import mqpacker from 'css-mqpacker'
import csswring from 'csswring'
import nested from 'postcss-nested'

// Front end *ifyers
import browserifyInc from 'browserify-incremental'
import babelify from 'babelify'
import envify from 'envify'
import sourcemaps from 'gulp-sourcemaps'
import uglify from 'gulp-uglify'

// Autoreload magic
import browserSync from 'browser-sync'
import connectLogger from 'connect-logger'
import historyApiFallback from 'connect-history-api-fallback'

// Secrets (shhh)
import dotenv from 'dotenv'
dotenv.load()

// Releasing
import symlink from 'gulp-symlink'
const timestamp = new Date().toISOString().replace(/[^\w]/g, '-')

// *************************************************************************************************
// Configuration
// *************************************************************************************************

const buildDir = 'build'
const releasesDir = 'releases'
const indexPath = 'index.html'
const scriptsDir = 'scripts'
const stylesDir = 'styles'
const imagesDir = 'images'

// *************************************************************************************************
// Top-level tasks
// *************************************************************************************************

gulp.task('default', [ 'build' ])

gulp.task('serve', [ 'watch' ], cb => (
  sequence([ 'browsersync' ], cb)
))

gulp.task('build', cb => (
  sequence('clean', [ 'styles', 'bundle', 'pages', 'assets' ], cb)
))

gulp.task('release', [ 'release:prepare', 'release:create', 'release:cleanup' ])

gulp.task('watch', [ 'build' ], cb => (
  sequence([ 'styles:watch', 'bundle:watch', 'pages:watch', 'assets:watch' ], cb)
))

// *************************************************************************************************
// Sub-tasks
// *************************************************************************************************

gulp.task('clean', () => (
  del([ path.join(buildDir, '**/*') ])
))

gulp.task('styles', () => {
  var processors = [
    autoprefixer({ browsers: [ 'last 1 version' ] }),
    mqpacker,
    csswring,
    nested
  ]

  return gulp.src(path.join(stylesDir, 'main.css'))
    .pipe(plumber({ errorHandler: notify.onError('Error <%= error.message %>') }))
    .pipe(sourcemaps.init())
    .pipe(postcss(processors))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(path.join(buildDir, stylesDir)))
    .pipe(browserSync.stream())
})

gulp.task('styles:watch', () => (
  gulp.watch(path.join(stylesDir, '**/*.css'), [ 'styles' ])
))

gulp.task('assets', () => (
  gulp.src(path.join(imagesDir, '**/*'))
    .pipe(gulp.dest(path.join(buildDir, imagesDir)))
    .pipe(browserSync.stream())
))

gulp.task('assets:watch', () => (
  gulp.watch(path.join(imagesDir, '**/*'), [ 'assets' ])
))

gulp.task('pages', () => (
  gulp.src(indexPath)
    .pipe(gulp.dest(buildDir))
    .pipe(browserSync.stream())
))

gulp.task('pages:watch', () => (
  gulp.watch(indexPath, [ 'pages' ])
))

var bundleOpts = { debug: true, paths: [ './scripts' ], cacheFile: '.browserifyCache.json' }
var bundler = browserifyInc('scripts/app.js', bundleOpts)
bundler.transform(babelify)
bundler.transform(envify)

gulp.task('bundle', () => {
  bundler.bundle()
    .on('error', notify.onError('Error <%= error.message %>'))
    .pipe(source('bundle.js'))
    .pipe(gulp.dest(path.join(buildDir, scriptsDir)))
    .pipe(browserSync.stream())
})

gulp.task('bundle:watch', () => (
  gulp.watch(path.join(scriptsDir, '**/*.js'), [ 'bundle' ])
))

gulp.task('browsersync', () => {
  browserSync({
    server: {
      baseDir: buildDir,
      middleware: [ connectLogger(), historyApiFallback() ]
    },
    open: true,
    notify: true
  })
})

function getFolders (dir) {
  try {
    return fs.readdirSync(dir)
      .filter((file) => fs.statSync(path.join(dir, file)).isDirectory())
  } catch (e) {
    return []
  }
}

gulp.task('release:prepare', [ 'build' ], () => (
  gulp.src(path.join(buildDir, scriptsDir, 'bundle.js'))
    .pipe(uglify())
    .pipe(gulp.dest(path.join(buildDir, scriptsDir)))
))

gulp.task('release:create', [ 'build', 'release:prepare' ], done => (
  gulp.src(path.join(buildDir, '**/*'))
    .pipe(gulp.dest(path.join(releasesDir, timestamp)))
    .on('end', () => (
      gulp.src(path.join(releasesDir, timestamp))
        .pipe(symlink(path.join(releasesDir, 'current'), { force: true }))
        .on('end', done)
    ))
))

gulp.task('release:cleanup', done => {
  const releases = getFolders(releasesDir).map(s => path.join(releasesDir, s))
  const oldReleases = releases.slice(0, -5)

  del(oldReleases, done)
})

gulp.task('rollback', () => {
  const releases = getFolders(releasesDir).map(s => path.join(releasesDir, s))
  const previousRelease = releases[releases.length - 3]
  const latestRelease = releases[releases.length - 2]

  if (previousRelease) {
    return gulp.src(previousRelease)
      .pipe(symlink(path.join(releasesDir, 'current'), { force: true }))
      .on('end', () => del([ latestRelease ]))
  } else {
    gutil.log(gutil.colors.red('No previous release was found.'))
    process.exit(1)
  }
})
