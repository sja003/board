const express = require('express');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');

const app = express();
const port = 3000;

if(!fs.existsSync('./data')) fs.mkdirSync('./data');
const db = new sqlite3.Database('./data/board.db');
if(!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const storage = multer.diskStorage({
  destination: function (req,file,cb) {
    cb(null, 'uploads/');
  },
  filename: function (req,file,cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null,uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    description TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    categoryId INTEGER,
    title TEXT,
    content TEXT,
    price INTEGER,
    originalPrice INTEGER,
    productCondition TEXT CHECK(productCondition IN ('new', 'like_new', 'used', 'damaged')),
    tradeStatus TEXT CHECK(tradeStatus IN ('selling', 'reserved', 'sold')) DEFAULT 'selling',
    tradeLocation TEXT,
    contactPhone TEXT,
    contactKakao TEXT,
    image TEXT,
    views INTEGER DEFAULT 0,
    createdAt TEXT,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(categoryId) REFERENCES categories(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postId INTEGER,
    userId INTEGER,
    content TEXT,
    createdAt TEXT,
    FOREIGN KEY(postId) REFERENCES posts(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS post_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postId INTEGER,
    userId INTEGER,
    type TEXT CHECK(type IN ('like', 'dislike')),
    createdAt TEXT,
    UNIQUE(postId, userId),
    FOREIGN KEY(postId) REFERENCES posts(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postId INTEGER,
    userId INTEGER,
    createdAt TEXT,
    UNIQUE(postId, userId),
    FOREIGN KEY(postId) REFERENCES posts(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS price_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postId INTEGER,
    userId INTEGER,
    offerPrice INTEGER,
    message TEXT,
    status TEXT CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    createdAt TEXT,
    FOREIGN KEY(postId) REFERENCES posts(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  // 기본 카테고리 초기화 (메시지 없이)
  const defaultCategories = [
    ['전자제품', '휴대폰, 컴퓨터, 가전제품 등'],
    ['의류/잡화', '옷, 신발, 가방, 액세서리 등'],
    ['가구/인테리어', '침대, 책상, 소파, 장식품 등'],
    ['도서/문구', '책, 교재, 필기구, 사무용품 등'],
    ['스포츠/레저', '운동기구, 레저용품, 스포츠웨어 등'],
    ['취미/게임', '보드게임, 콘솔, 수집품 등'],
    ['뷰티/미용', '화장품, 미용기기, 향수 등'],
    ['기타', '분류되지 않는 기타 상품들']
  ];

  defaultCategories.forEach(([name, description]) => {
    db.run(`INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)`, [name, description]);
  });

  // 기존 posts 테이블에 새 컬럼 추가 (테이블이 이미 존재하는 경우)
  db.run(`ALTER TABLE posts ADD COLUMN price INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN originalPrice INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN productCondition TEXT DEFAULT 'used'`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN tradeStatus TEXT DEFAULT 'selling'`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN tradeLocation TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN contactPhone TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN contactKakao TEXT DEFAULT ''`, () => {});
});

app.set('view engine', 'ejs');
app.set('layout', 'layout');
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(expressLayouts);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true
}));

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

app.use((req,res,next) => {
  res.locals.session = req.session;
  next();
});

app.get('/register', (req, res) => res.render('register', {title: '회원가입'}));

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, String(password)], err => {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).send('이미 존재하는 사용자명입니다.');
      }
      return res.status(500).send('회원가입 실패');
    }
    res.send('회원가입 완료. <a href="/login">로그인하기</a>');
  });
});

app.get('/login', (req, res) => res.render('login', {title: '로그인'}));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
    if(err) return res.status(500).send('DB 오류: ' + err.message);
    if (!user) return res.status(401).send('로그인 실패: 아이디 또는 비밀번호가 틀렸습니다');
    req.session.userId = user.id;
    req.session.username = user.username;
    res.redirect('/');
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// 메인 페이지 - 페이지네이션, 정렬, 카테고리 필터링 지원
app.get('/', requireLogin, (req, res) => {
  const query = req.query.q?.trim();
  const categoryId = req.query.category;
  const sortBy = req.query.sort || 'latest';
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  // 정렬 조건 설정
  let orderBy = 'posts.id DESC';
  switch(sortBy) {
    case 'views':
      orderBy = 'posts.views DESC, posts.id DESC';
      break;
    case 'likes':
      orderBy = 'like_count DESC, posts.id DESC';
      break;
    case 'price_low':
      orderBy = 'posts.price ASC, posts.id DESC';
      break;
    case 'price_high':
      orderBy = 'posts.price DESC, posts.id DESC';
      break;
    case 'oldest':
      orderBy = 'posts.id ASC';
      break;
    default:
      orderBy = 'posts.id DESC';
  }

  let whereConditions = [];
  let params = [];
  
  if (query) {
    whereConditions.push('posts.title LIKE ?');
    params.push(`%${query}%`);
  }
  
  if (categoryId) {
    whereConditions.push('posts.categoryId = ?');
    params.push(categoryId);
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // 게시글 조회 (좋아요 수 포함)
  const sql = `
    SELECT posts.*, users.username, categories.name as categoryName,
           COALESCE(like_stats.like_count, 0) as like_count,
           COALESCE(like_stats.dislike_count, 0) as dislike_count
    FROM posts 
    JOIN users ON posts.userId = users.id 
    LEFT JOIN categories ON posts.categoryId = categories.id
    LEFT JOIN (
      SELECT postId, 
             SUM(CASE WHEN type = 'like' THEN 1 ELSE 0 END) as like_count,
             SUM(CASE WHEN type = 'dislike' THEN 1 ELSE 0 END) as dislike_count
      FROM post_likes 
      GROUP BY postId
    ) like_stats ON posts.id = like_stats.postId
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  // 전체 게시글 수 조회
  const countSql = `
    SELECT COUNT(*) as total
    FROM posts 
    JOIN users ON posts.userId = users.id 
    ${whereClause}
  `;

  // 카테고리 목록 조회
  db.all('SELECT * FROM categories ORDER BY id', (err, categories) => {
    if (err) return res.status(500).send('카테고리 조회 실패');

    db.get(countSql, params, (err, countResult) => {
      if (err) return res.status(500).send('DB 오류');

      const totalPosts = countResult.total;
      const totalPages = Math.ceil(totalPosts / limit);

      db.all(sql, [...params, limit, offset], (err, posts) => {
        if (err) return res.status(500).send('DB 오류');
        
        res.render('index', { 
          title: '게시판 목록', 
          posts, 
          query, 
          categoryId: categoryId || '',
          sortBy,
          categories,
          currentPage: page,
          totalPages,
          totalPosts
        });
      });
    });
  });
});

app.get('/write', requireLogin, (req, res) => {
  db.all('SELECT * FROM categories ORDER BY id', (err, categories) => {
    if (err) return res.status(500).send('카테고리 조회 실패');
    res.render('write', {title: '글쓰기', categories});
  });
});

app.post('/write', requireLogin, upload.single('image'),(req, res) => {
  const { title, content, categoryId, price, originalPrice, productCondition, tradeStatus, tradeLocation, contactPhone, contactKakao } = req.body;
  const createdAt = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).replace(/\. /g, '.').replace('.', '');
  const userId = req.session.userId;
  const image = req.file ? req.file.filename : null;

  db.run(`INSERT INTO posts (userId, categoryId, title, content, price, originalPrice, productCondition, tradeStatus, tradeLocation, contactPhone, contactKakao, image, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, categoryId, title, content, price || 0, originalPrice || 0, productCondition, tradeStatus || 'selling', tradeLocation || '', contactPhone || '', contactKakao || '', image, createdAt], err => {
      if (err) return res.status(500).send('상품 등록 실패');
      res.redirect('/');
    });
});

// 게시글 상세보기 - 조회수 증가 및 좋아요/북마크 상태 확인
app.get('/post/:id', requireLogin, (req, res) => {
  const postId = req.params.id;
  const userId = req.session.userId;

  db.run('UPDATE posts SET views = views + 1 WHERE id = ?', [postId], (err) => {
    if (err) console.error('조회수 업데이트 오류:', err);
  });

  // 게시글 정보 조회
  db.get(`
    SELECT posts.*, users.username, categories.name as categoryName,
           COALESCE(like_stats.like_count, 0) as like_count,
           COALESCE(like_stats.dislike_count, 0) as dislike_count
    FROM posts 
    JOIN users ON posts.userId = users.id 
    LEFT JOIN categories ON posts.categoryId = categories.id
    LEFT JOIN (
      SELECT postId, 
             SUM(CASE WHEN type = 'like' THEN 1 ELSE 0 END) as like_count,
             SUM(CASE WHEN type = 'dislike' THEN 1 ELSE 0 END) as dislike_count
      FROM post_likes 
      GROUP BY postId
    ) like_stats ON posts.id = like_stats.postId
    WHERE posts.id = ?
  `, [postId], (err, post) => {
      
    if (err || !post) return res.status(404).send('게시글이 없습니다.');

    // 조회수 업데이트 후 화면에 표시할 조회수 증가
    post.views += 1;

    // 사용자의 좋아요 상태 확인
    db.get('SELECT type FROM post_likes WHERE postId = ? AND userId = ?', [postId, userId], (err, userLike) => {
      
      // 사용자의 북마크 상태 확인
      db.get('SELECT id FROM bookmarks WHERE postId = ? AND userId = ?', [postId, userId], (err, bookmark) => {

        // 댓글 조회
        db.all(`SELECT comments.*, users.username FROM comments 
                JOIN users ON comments.userId = users.id 
                WHERE postId = ? ORDER BY comments.id DESC`, 
          [postId], (err, comments) => {

          if (err) return res.status(500).send('댓글 조회 실패');

          res.render('post', { 
            title: post.title, 
            post, 
            comments,
            userLikeType: userLike ? userLike.type : null,
            isBookmarked: !!bookmark
          });
        });
      });
    });
  });
});

// 좋아요/싫어요 처리
app.post('/post/:id/like', requireLogin, (req, res) => {
  const postId = req.params.id;
  const userId = req.session.userId;
  const type = req.body.type; // 'like' or 'dislike'

  // 기존 좋아요/싫어요 확인
  db.get('SELECT * FROM post_likes WHERE postId = ? AND userId = ?', [postId, userId], (err, existing) => {
    if (err) return res.status(500).send('DB 오류');

    const createdAt = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).replace(/\. /g, '.').replace('.', '');

    if (existing) {
      if (existing.type === type) {
        // 같은 타입이면 취소
        db.run('DELETE FROM post_likes WHERE postId = ? AND userId = ?', [postId, userId], (err) => {
          if (err) return res.status(500).send('처리 실패');
          res.redirect(`/post/${postId}`);
        });
      } else {
        // 다른 타입이면 업데이트
        db.run('UPDATE post_likes SET type = ?, createdAt = ? WHERE postId = ? AND userId = ?', 
          [type, createdAt, postId, userId], (err) => {
            if (err) return res.status(500).send('처리 실패');
            res.redirect(`/post/${postId}`);
          });
      }
    } else {
      // 새로 추가
      db.run('INSERT INTO post_likes (postId, userId, type, createdAt) VALUES (?, ?, ?, ?)',
        [postId, userId, type, createdAt], (err) => {
          if (err) return res.status(500).send('처리 실패');
          res.redirect(`/post/${postId}`);
        });
    }
  });
});

// 북마크 토글
app.post('/post/:id/bookmark', requireLogin, (req, res) => {
  const postId = req.params.id;
  const userId = req.session.userId;

  db.get('SELECT id FROM bookmarks WHERE postId = ? AND userId = ?', [postId, userId], (err, bookmark) => {
    if (err) return res.status(500).send('DB 오류');

    const createdAt = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).replace(/\. /g, '.').replace('.', '');

    if (bookmark) {
      // 북마크 해제
      db.run('DELETE FROM bookmarks WHERE postId = ? AND userId = ?', [postId, userId], (err) => {
        if (err) return res.status(500).send('북마크 해제 실패');
        res.redirect(`/post/${postId}`);
      });
    } else {
      // 북마크 추가
      db.run('INSERT INTO bookmarks (postId, userId, createdAt) VALUES (?, ?, ?)',
        [postId, userId, createdAt], (err) => {
          if (err) return res.status(500).send('북마크 추가 실패');
          res.redirect(`/post/${postId}`);
        });
    }
  });
});

// 내 북마크 목록
app.get('/bookmarks', requireLogin, (req, res) => {
  const userId = req.session.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  const sql = `
    SELECT posts.*, users.username, categories.name as categoryName, bookmarks.createdAt as bookmarkedAt
    FROM bookmarks
    JOIN posts ON bookmarks.postId = posts.id
    JOIN users ON posts.userId = users.id
    LEFT JOIN categories ON posts.categoryId = categories.id
    WHERE bookmarks.userId = ?
    ORDER BY bookmarks.createdAt DESC
    LIMIT ? OFFSET ?
  `;

  db.get('SELECT COUNT(*) as total FROM bookmarks WHERE userId = ?', [userId], (err, countResult) => {
    if (err) return res.status(500).send('DB 오류');

    const totalBookmarks = countResult.total;
    const totalPages = Math.ceil(totalBookmarks / limit);

    db.all(sql, [userId, limit, offset], (err, bookmarks) => {
      if (err) return res.status(500).send('북마크 조회 실패');
      
      res.render('bookmarks', {
        title: '내 북마크',
        bookmarks,
        currentPage: page,
        totalPages
      });
    });
  });
});

// 내 글 목록
app.get('/myposts', requireLogin, (req, res) => {
  const userId = req.session.userId;
  const page = parseInt(req.query.page) || 1;
  const categoryId = req.query.category;
  const sortBy = req.query.sort || 'latest';
  const limit = 10;
  const offset = (page - 1) * limit;

  let orderBy = 'posts.id DESC';
  switch(sortBy) {
    case 'views':
      orderBy = 'posts.views DESC, posts.id DESC';
      break;
    case 'likes':
      orderBy = 'like_count DESC, posts.id DESC';
      break;
    case 'price_low':
      orderBy = 'posts.price ASC, posts.id DESC';
      break;
    case 'price_high':
      orderBy = 'posts.price DESC, posts.id DESC';
      break;
    case 'oldest':
      orderBy = 'posts.id ASC';
      break;
    default:
      orderBy = 'posts.id DESC';
  }

  let whereConditions = ['posts.userId = ?'];
  let params = [userId];
  
  if (categoryId) {
    whereConditions.push('posts.categoryId = ?');
    params.push(categoryId);
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  const sql = `
    SELECT posts.*, users.username, categories.name as categoryName,
           COALESCE(like_stats.like_count, 0) as like_count,
           COALESCE(like_stats.dislike_count, 0) as dislike_count,
           COALESCE(comment_count.count, 0) as comment_count
    FROM posts 
    JOIN users ON posts.userId = users.id 
    LEFT JOIN categories ON posts.categoryId = categories.id
    LEFT JOIN (
      SELECT postId, 
             SUM(CASE WHEN type = 'like' THEN 1 ELSE 0 END) as like_count,
             SUM(CASE WHEN type = 'dislike' THEN 1 ELSE 0 END) as dislike_count
      FROM post_likes 
      GROUP BY postId
    ) like_stats ON posts.id = like_stats.postId
    LEFT JOIN (
      SELECT postId, COUNT(*) as count
      FROM comments
      GROUP BY postId
    ) comment_count ON posts.id = comment_count.postId
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) as total
    FROM posts 
    ${whereClause}
  `;

  db.all('SELECT * FROM categories ORDER BY id', (err, categories) => {
    if (err) return res.status(500).send('카테고리 조회 실패');

    db.get(countSql, params, (err, countResult) => {
      if (err) return res.status(500).send('DB 오류');

      const totalPosts = countResult.total;
      const totalPages = Math.ceil(totalPosts / limit);

      db.all(sql, [...params, limit, offset], (err, posts) => {
        if (err) return res.status(500).send('DB 오류');
        
        res.render('myposts', { 
          title: '내가 쓴 글', 
          posts, 
          categoryId: categoryId || '',
          sortBy,
          categories,
          currentPage: page,
          totalPages,
          totalPosts,
          query: ''
        });
      });
    });
  });
});

app.post('/post/:id/comments', requireLogin, (req, res) => {
  const postId = req.params.id;
  const content = req.body.content;
  const createdAt = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).replace(/\. /g, '.').replace('.', '');
  const userId = req.session.userId;

  db.run(`INSERT INTO comments (postId, userId, content, createdAt) VALUES (?, ?, ?, ?)`,[postId, userId, content, createdAt], err => {
      if (err) return res.status(500).send('댓글 저장 실패');
      res.redirect(`/post/${postId}`);
    });
});

app.get('/comments/:id/edit', requireLogin, (req, res) => {
  const commentId = req.params.id;

  db.get(`SELECT * FROM comments WHERE id = ?`, [commentId], (err, comment) => {
    if (err || !comment || comment.userId !== req.session.userId)
      return res.status(403).send('권한 없음');
    res.render('edit-comment', { title: '댓글 수정', comment });
  });
});

app.put('/comments/:id', requireLogin, (req, res) => {
  const commentId = req.params.id;
  const { content } = req.body;

  db.get(`SELECT * FROM comments WHERE id = ?`, [commentId], (err, comment) => {
    if (err || !comment || comment.userId !== req.session.userId)
      return res.status(403).send('권한 없음');

    db.run(`UPDATE comments SET content = ? WHERE id = ?`, [content, commentId], err => {
      if (err) return res.status(500).send('댓글 수정 실패');
      res.redirect(`/post/${comment.postId}`);
    });
  });
});

app.delete('/comments/:id', requireLogin, (req, res) => {
  const commentId = req.params.id;

  db.get(`SELECT * FROM comments WHERE id = ?`, [commentId], (err, comment) => {
    if (err || !comment || comment.userId !== req.session.userId)
      return res.status(403).send('권한 없음');

    db.run(`DELETE FROM comments WHERE id = ?`, [commentId], err => {
      if (err) return res.status(500).send('댓글 삭제 실패');
      res.redirect(`/post/${comment.postId}`);
    });
  });
});

// 글 수정 폼
app.get('/edit/:id', requireLogin, (req, res) => {
  db.get(`SELECT * FROM posts WHERE id = ?`, [req.params.id], (err, post) => {
    if (err || !post || post.userId !== req.session.userId)
      return res.status(403).send('권한이 없습니다.');
    
    db.all('SELECT * FROM categories ORDER BY id', (err, categories) => {
      if (err) return res.status(500).send('카테고리 조회 실패');
      res.render('edit', { title: '글 수정', post, categories });
    });
  });
});

// 글 수정 처리
app.put('/edit/:id', requireLogin, upload.single('image'), (req, res) => {
  const { title, content, categoryId, price, originalPrice, productCondition, tradeStatus, tradeLocation, contactPhone, contactKakao } = req.body;
  const image = req.file ? req.file.filename : null;

  db.get(`SELECT * FROM posts WHERE id = ?`, [req.params.id], (err, post) => {
    if (err || !post || post.userId !== req.session.userId)
      return res.status(403).send('권한이 없습니다.');

    const updatedImage = image || post.image;
    db.run(`UPDATE posts SET title = ?, content = ?, categoryId = ?, price = ?, originalPrice = ?, productCondition = ?, tradeStatus = ?, tradeLocation = ?, contactPhone = ?, contactKakao = ?, image = ? WHERE id = ?`, 
      [title, content, categoryId, price || 0, originalPrice || 0, productCondition, tradeStatus || 'selling', tradeLocation || '', contactPhone || '', contactKakao || '', updatedImage, req.params.id], err => {
        if (err) return res.status(500).send('수정 실패');
        res.redirect(`/post/${req.params.id}`);
      });
  });
});

// 글 삭제
app.delete('/delete/:id', requireLogin, (req, res) => {
  const postId = req.params.id;
  db.get(`SELECT * FROM posts WHERE id = ?`, [postId], (err, post) => {
    if (err || !post || post.userId !== req.session.userId)
      return res.status(403).send('권한이 없습니다.');

    // 관련 데이터 모두 삭제
    db.run(`DELETE FROM post_likes WHERE postId = ?`, [postId]);
    db.run(`DELETE FROM bookmarks WHERE postId = ?`, [postId]);
    db.run(`DELETE FROM comments WHERE postId = ?`, [postId]);
    
    db.run(`DELETE FROM posts WHERE id = ?`, [postId], err => {
      if (err) return res.status(500).send('삭제 실패');
      res.redirect('/');
    });
  });
});

app.listen(port, () => {
  console.log(`송주아 중고나라 게시판 서버 실행 중: http://localhost:${port}`);
});