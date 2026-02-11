// MongoDB连接（可选依赖）
let db = null;
let client = null;
let MongoClient = null;
const DB_NAME = 'fanyi-cli';
const COLLECTION_NAME = 'history';

async function connectDB() {
  if (db) {
    return; // 已经连接
  }
  
  // 动态导入mongodb，如果未安装则跳过
  try {
    if (!MongoClient) {
      const mongodb = await import('mongodb');
      MongoClient = mongodb.MongoClient;
    }
    
    client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    db = client.db(DB_NAME);
  } catch (error) {
    // 静默失败，不影响翻译功能
    db = null;
    client = null;
  }
}

// 保存翻译历史（供CLI调用）
export async function saveHistory(text, result, config) {
  try {
    if (!db) {
      await connectDB();
    }
    if (db) {
      const collection = db.collection(COLLECTION_NAME);
      await collection.insertOne({
        text,
        result,
        provider: config.provider || 'libre',
        from: config.from || 'auto',
        to: config.to || 'zh',
        timestamp: new Date(),
      });
    }
  } catch (error) {
    // 静默失败，不影响翻译功能
  }
}
