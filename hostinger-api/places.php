<?php
declare(strict_types=1);
$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['error' => 'Server configuration missing']);
  exit;
}
$config = require $configFile;
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && hash_equals((string)$config['allowed_origin'], $origin)) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
}
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  http_response_code(405);
  echo json_encode(['error' => 'Method not allowed']);
  exit;
}
try {
  $pdo = new PDO($config['dsn'], $config['user'], $config['password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false
  ]);
  $stmt = $pdo->prepare("select id,name_ku,name_ar,name_en,category,category_ku,admin_governorate_ku,admin_district_ku,latitude,longitude,min_zoom,priority,status from places where status='published' order by priority desc, created_at desc limit 10000");
  $stmt->execute();
  echo json_encode(['data' => $stmt->fetchAll()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'Database request failed']);
}
