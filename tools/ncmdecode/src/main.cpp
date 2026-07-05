#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>
#include <bcrypt.h>

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cwchar>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace fs = std::filesystem;

namespace {

constexpr unsigned char CORE_KEY[16] = {
    0x68, 0x7A, 0x48, 0x52, 0x41, 0x6D, 0x73, 0x6F,
    0x35, 0x6B, 0x49, 0x6E, 0x62, 0x61, 0x78, 0x57};
constexpr unsigned char META_KEY[16] = {
    0x23, 0x31, 0x34, 0x6C, 0x6A, 0x6B, 0x5F, 0x21,
    0x5C, 0x5D, 0x26, 0x30, 0x55, 0x3C, 0x27, 0x28};
constexpr unsigned char NCM_MAGIC[8] = {'C', 'T', 'E', 'N', 'F', 'D', 'A', 'M'};

struct DecodeResult {
  std::vector<unsigned char> audio;
  std::string meta_json;
  std::vector<unsigned char> cover;
  std::string format;
};

class DecodeError : public std::runtime_error {
public:
  explicit DecodeError(const std::string& message) : std::runtime_error(message) {}
};

class BcryptAlgorithm {
public:
  BcryptAlgorithm() {
    NTSTATUS status = BCryptOpenAlgorithmProvider(&handle_, BCRYPT_AES_ALGORITHM, nullptr, 0);
    if (status < 0) throw DecodeError("failed to open AES provider");
    status = BCryptSetProperty(
        handle_,
        BCRYPT_CHAINING_MODE,
        reinterpret_cast<PUCHAR>(const_cast<wchar_t*>(BCRYPT_CHAIN_MODE_ECB)),
        static_cast<ULONG>((wcslen(BCRYPT_CHAIN_MODE_ECB) + 1) * sizeof(wchar_t)),
        0);
    if (status < 0) throw DecodeError("failed to configure AES ECB mode");
  }

  ~BcryptAlgorithm() {
    if (handle_) BCryptCloseAlgorithmProvider(handle_, 0);
  }

  BCRYPT_ALG_HANDLE get() const { return handle_; }

private:
  BCRYPT_ALG_HANDLE handle_ = nullptr;
};

class BcryptKey {
public:
  BcryptKey(BCRYPT_ALG_HANDLE algorithm, const unsigned char* key, ULONG key_size) {
    NTSTATUS status = BCryptGenerateSymmetricKey(
        algorithm,
        &handle_,
        nullptr,
        0,
        const_cast<PUCHAR>(reinterpret_cast<const UCHAR*>(key)),
        key_size,
        0);
    if (status < 0) throw DecodeError("failed to create AES key");
  }

  ~BcryptKey() {
    if (handle_) BCryptDestroyKey(handle_);
  }

  BCRYPT_KEY_HANDLE get() const { return handle_; }

private:
  BCRYPT_KEY_HANDLE handle_ = nullptr;
};

void print_usage() {
  std::cout << "Usage: ncmdecode --input <song.ncm> --out-dir <decoded-dir>\n"
            << "Outputs audio.mp3/audio.flac, meta.json, and optional cover.jpg/cover.png.\n";
}

std::vector<unsigned char> read_file(const fs::path& path) {
  std::ifstream file(path, std::ios::binary);
  if (!file) throw DecodeError("failed to open input file");
  file.seekg(0, std::ios::end);
  const auto size = file.tellg();
  if (size < 0) throw DecodeError("failed to read input size");
  std::vector<unsigned char> data(static_cast<size_t>(size));
  file.seekg(0, std::ios::beg);
  if (!data.empty()) file.read(reinterpret_cast<char*>(data.data()), static_cast<std::streamsize>(data.size()));
  if (!file) throw DecodeError("failed to read input file");
  return data;
}

void write_file(const fs::path& path, const std::vector<unsigned char>& data) {
  std::ofstream file(path, std::ios::binary);
  if (!file) throw DecodeError("failed to open output file: " + path.string());
  if (!data.empty()) file.write(reinterpret_cast<const char*>(data.data()), static_cast<std::streamsize>(data.size()));
  if (!file) throw DecodeError("failed to write output file: " + path.string());
}

void write_text_file(const fs::path& path, const std::string& text) {
  std::ofstream file(path, std::ios::binary);
  if (!file) throw DecodeError("failed to open output file: " + path.string());
  file.write(text.data(), static_cast<std::streamsize>(text.size()));
  if (!file) throw DecodeError("failed to write output file: " + path.string());
}

uint32_t read_u32_le(const std::vector<unsigned char>& data, size_t& offset) {
  if (offset + 4 > data.size()) throw DecodeError("truncated NCM block length");
  uint32_t value = static_cast<uint32_t>(data[offset]) |
                   (static_cast<uint32_t>(data[offset + 1]) << 8) |
                   (static_cast<uint32_t>(data[offset + 2]) << 16) |
                   (static_cast<uint32_t>(data[offset + 3]) << 24);
  offset += 4;
  return value;
}

std::vector<unsigned char> read_block(const std::vector<unsigned char>& data, size_t& offset) {
  const uint32_t length = read_u32_le(data, offset);
  if (offset + length > data.size()) throw DecodeError("truncated NCM data block");
  std::vector<unsigned char> block(data.begin() + static_cast<std::ptrdiff_t>(offset),
                                   data.begin() + static_cast<std::ptrdiff_t>(offset + length));
  offset += length;
  return block;
}

std::vector<unsigned char> pkcs7_unpad(std::vector<unsigned char> data) {
  if (data.empty()) return data;
  const unsigned char pad = data.back();
  if (pad < 1 || pad > 16 || pad > data.size()) return data;
  const bool valid = std::all_of(data.end() - pad, data.end(), [pad](unsigned char item) { return item == pad; });
  if (valid) data.resize(data.size() - pad);
  return data;
}

std::vector<unsigned char> pkcs7_pad(std::vector<unsigned char> data) {
  const size_t pad = 16 - (data.size() % 16);
  data.insert(data.end(), pad, static_cast<unsigned char>(pad));
  return data;
}

std::vector<unsigned char> aes_ecb_decrypt(const unsigned char* key, const std::vector<unsigned char>& input) {
  if (input.empty() || input.size() % 16 != 0) throw DecodeError("AES input is not block aligned");

  BcryptAlgorithm algorithm;
  BcryptKey key_handle(algorithm.get(), key, 16);

  ULONG output_size = 0;
  NTSTATUS status = BCryptDecrypt(
      key_handle.get(),
      const_cast<PUCHAR>(input.data()),
      static_cast<ULONG>(input.size()),
      nullptr,
      nullptr,
      0,
      nullptr,
      0,
      &output_size,
      0);
  if (status < 0) throw DecodeError("failed to size AES decrypt output");

  std::vector<unsigned char> output(output_size);
  status = BCryptDecrypt(
      key_handle.get(),
      const_cast<PUCHAR>(input.data()),
      static_cast<ULONG>(input.size()),
      nullptr,
      nullptr,
      0,
      output.data(),
      static_cast<ULONG>(output.size()),
      &output_size,
      0);
  if (status < 0) throw DecodeError("AES decrypt failed");
  output.resize(output_size);
  return pkcs7_unpad(std::move(output));
}

std::vector<unsigned char> aes_ecb_encrypt(const unsigned char* key, std::vector<unsigned char> input) {
  input = pkcs7_pad(std::move(input));

  BcryptAlgorithm algorithm;
  BcryptKey key_handle(algorithm.get(), key, 16);

  ULONG output_size = 0;
  NTSTATUS status = BCryptEncrypt(
      key_handle.get(),
      input.data(),
      static_cast<ULONG>(input.size()),
      nullptr,
      nullptr,
      0,
      nullptr,
      0,
      &output_size,
      0);
  if (status < 0) throw DecodeError("failed to size AES encrypt output");

  std::vector<unsigned char> output(output_size);
  status = BCryptEncrypt(
      key_handle.get(),
      input.data(),
      static_cast<ULONG>(input.size()),
      nullptr,
      nullptr,
      0,
      output.data(),
      static_cast<ULONG>(output.size()),
      &output_size,
      0);
  if (status < 0) throw DecodeError("AES encrypt failed");
  output.resize(output_size);
  return output;
}

std::vector<unsigned char> base64_decode(std::string_view input) {
  static int table[256];
  static bool initialized = false;
  if (!initialized) {
    std::fill(std::begin(table), std::end(table), -1);
    const std::string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (int i = 0; i < static_cast<int>(alphabet.size()); ++i) {
      table[static_cast<unsigned char>(alphabet[static_cast<size_t>(i)])] = i;
    }
    initialized = true;
  }

  std::vector<unsigned char> output;
  int accumulator = 0;
  int bits = -8;
  for (unsigned char c : input) {
    if (c == '=') break;
    if (table[c] < 0) continue;
    accumulator = (accumulator << 6) | table[c];
    bits += 6;
    if (bits >= 0) {
      output.push_back(static_cast<unsigned char>((accumulator >> bits) & 0xFF));
      bits -= 8;
    }
  }
  return output;
}

std::string base64_encode(const std::vector<unsigned char>& input) {
  static constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string output;
  output.reserve(((input.size() + 2) / 3) * 4);

  for (size_t i = 0; i < input.size(); i += 3) {
    const uint32_t octet_a = input[i];
    const uint32_t octet_b = i + 1 < input.size() ? input[i + 1] : 0;
    const uint32_t octet_c = i + 2 < input.size() ? input[i + 2] : 0;
    const uint32_t triple = (octet_a << 16) | (octet_b << 8) | octet_c;

    output.push_back(alphabet[(triple >> 18) & 0x3F]);
    output.push_back(alphabet[(triple >> 12) & 0x3F]);
    output.push_back(i + 1 < input.size() ? alphabet[(triple >> 6) & 0x3F] : '=');
    output.push_back(i + 2 < input.size() ? alphabet[triple & 0x3F] : '=');
  }

  return output;
}

std::vector<unsigned char> decode_rc4_key(std::vector<unsigned char> blob) {
  for (auto& item : blob) item ^= 0x64;
  auto decrypted = aes_ecb_decrypt(CORE_KEY, blob);
  const std::string prefix = "neteasecloudmusic";
  if (decrypted.size() >= prefix.size() &&
      std::equal(prefix.begin(), prefix.end(), decrypted.begin())) {
    decrypted.erase(decrypted.begin(), decrypted.begin() + static_cast<std::ptrdiff_t>(prefix.size()));
  }
  if (decrypted.empty()) throw DecodeError("empty NCM stream key");
  return decrypted;
}

std::string decode_meta(std::vector<unsigned char> blob) {
  if (blob.size() <= 22) return "{}";
  for (auto& item : blob) item ^= 0x63;
  std::string encoded(reinterpret_cast<const char*>(blob.data() + 22), blob.size() - 22);
  auto payload = base64_decode(encoded);
  if (payload.empty()) return "{}";
  auto decrypted = aes_ecb_decrypt(META_KEY, payload);
  const std::string prefix = "music:";
  if (decrypted.size() >= prefix.size() &&
      std::equal(prefix.begin(), prefix.end(), decrypted.begin())) {
    decrypted.erase(decrypted.begin(), decrypted.begin() + static_cast<std::ptrdiff_t>(prefix.size()));
  }
  if (decrypted.empty()) return "{}";
  return std::string(reinterpret_cast<const char*>(decrypted.data()), decrypted.size());
}

std::vector<unsigned char> build_keybox(const std::vector<unsigned char>& rc4_key) {
  std::vector<unsigned char> box(256);
  for (int i = 0; i < 256; ++i) box[static_cast<size_t>(i)] = static_cast<unsigned char>(i);

  int last = 0;
  const int key_len = static_cast<int>(rc4_key.size());
  for (int i = 0; i < 256; ++i) {
    const int swap = box[static_cast<size_t>(i)];
    last = (swap + last + rc4_key[static_cast<size_t>(i % key_len)]) & 0xFF;
    box[static_cast<size_t>(i)] = box[static_cast<size_t>(last)];
    box[static_cast<size_t>(last)] = static_cast<unsigned char>(swap);
  }

  std::vector<unsigned char> keybox(256);
  for (int i = 0; i < 256; ++i) {
    const int j = (i + 1) & 0xFF;
    const int sj = box[static_cast<size_t>(j)];
    const int sjj = box[static_cast<size_t>((j + sj) & 0xFF)];
    keybox[static_cast<size_t>(i)] = box[static_cast<size_t>((sj + sjj) & 0xFF)];
  }
  return keybox;
}

std::string detect_format(const std::vector<unsigned char>& audio, const std::string& meta_json) {
  std::string lowered = meta_json;
  std::transform(lowered.begin(), lowered.end(), lowered.begin(), [](unsigned char c) {
    return static_cast<char>(std::tolower(c));
  });
  if (lowered.find("\"format\"") != std::string::npos && lowered.find("flac") != std::string::npos) return "flac";
  if (lowered.find("\"format\"") != std::string::npos && lowered.find("mp3") != std::string::npos) return "mp3";
  if (audio.size() >= 4 && audio[0] == 'f' && audio[1] == 'L' && audio[2] == 'a' && audio[3] == 'C') return "flac";
  if (audio.size() >= 3 && audio[0] == 'I' && audio[1] == 'D' && audio[2] == '3') return "mp3";
  if (audio.size() >= 2 && audio[0] == 0xFF && (audio[1] & 0xE0) == 0xE0) return "mp3";
  return "mp3";
}

std::string cover_extension(const std::vector<unsigned char>& cover) {
  if (cover.size() >= 4 && cover[0] == 0x89 && cover[1] == 'P' && cover[2] == 'N' && cover[3] == 'G') return ".png";
  return ".jpg";
}

DecodeResult decode_ncm(const fs::path& input_path) {
  const auto data = read_file(input_path);
  if (data.size() < 10 || !std::equal(std::begin(NCM_MAGIC), std::end(NCM_MAGIC), data.begin())) {
    throw DecodeError("not a valid NCM file");
  }

  size_t offset = 8 + 2;
  const auto rc4_blob = read_block(data, offset);
  const auto rc4_key = decode_rc4_key(rc4_blob);
  const auto keybox = build_keybox(rc4_key);

  const auto meta_blob = read_block(data, offset);
  const auto meta_json = decode_meta(meta_blob);

  if (offset + 9 > data.size()) throw DecodeError("truncated NCM footer header");
  offset += 9;

  const auto cover = read_block(data, offset);
  if (offset > data.size()) throw DecodeError("invalid NCM audio offset");

  std::vector<unsigned char> audio(data.begin() + static_cast<std::ptrdiff_t>(offset), data.end());
  for (size_t i = 0; i < audio.size(); ++i) {
    audio[i] ^= keybox[i & 0xFF];
  }

  const auto format = detect_format(audio, meta_json);
  return DecodeResult{std::move(audio), meta_json, cover, format};
}

void append_u32_le(std::vector<unsigned char>& output, uint32_t value) {
  output.push_back(static_cast<unsigned char>(value & 0xFF));
  output.push_back(static_cast<unsigned char>((value >> 8) & 0xFF));
  output.push_back(static_cast<unsigned char>((value >> 16) & 0xFF));
  output.push_back(static_cast<unsigned char>((value >> 24) & 0xFF));
}

void append_block(std::vector<unsigned char>& output, const std::vector<unsigned char>& block) {
  append_u32_le(output, static_cast<uint32_t>(block.size()));
  output.insert(output.end(), block.begin(), block.end());
}

std::vector<unsigned char> bytes(std::string_view text) {
  return std::vector<unsigned char>(text.begin(), text.end());
}

std::vector<unsigned char> build_test_ncm(
    const std::vector<unsigned char>& audio,
    const std::vector<unsigned char>& rc4_key,
    std::string_view meta_json,
    const std::vector<unsigned char>& cover) {
  auto rc4_full = bytes("neteasecloudmusic");
  rc4_full.insert(rc4_full.end(), rc4_key.begin(), rc4_key.end());
  auto rc4_blob = aes_ecb_encrypt(CORE_KEY, std::move(rc4_full));
  for (auto& item : rc4_blob) item ^= 0x64;

  auto meta_payload = bytes("music:");
  meta_payload.insert(meta_payload.end(), meta_json.begin(), meta_json.end());
  auto encrypted_meta = aes_ecb_encrypt(META_KEY, std::move(meta_payload));
  auto meta_encoded = bytes("163 key(Don't modify):" + base64_encode(encrypted_meta));
  for (auto& item : meta_encoded) item ^= 0x63;

  auto keybox = build_keybox(rc4_key);
  auto encrypted_audio = audio;
  for (size_t i = 0; i < encrypted_audio.size(); ++i) encrypted_audio[i] ^= keybox[i & 0xFF];

  std::vector<unsigned char> output;
  output.insert(output.end(), std::begin(NCM_MAGIC), std::end(NCM_MAGIC));
  output.push_back(0);
  output.push_back(0);
  append_block(output, rc4_blob);
  append_block(output, meta_encoded);
  output.insert(output.end(), 9, 0);
  append_block(output, cover);
  output.insert(output.end(), encrypted_audio.begin(), encrypted_audio.end());
  return output;
}

int run_self_test() {
  std::vector<unsigned char> audio = {'I', 'D', '3', 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x15};
  const auto audio_tail = bytes("synthetic-audio-payload");
  audio.insert(audio.end(), audio_tail.begin(), audio_tail.end());
  const auto rc4_key = bytes("deterministic-test-stream-key");
  const std::string meta_json = R"({"musicName":"Test Song","artist":[["Artist",1]],"album":"Album","format":"mp3"})";
  const auto cover = bytes("\x89PNG\r\n\x1a\nsynthetic-cover");
  const auto ncm = build_test_ncm(audio, rc4_key, meta_json, cover);

  const auto temp_file = fs::temp_directory_path() / "ai-ktv-ncmdecode-self-test.ncm";
  write_file(temp_file, ncm);
  const auto result = decode_ncm(temp_file);
  std::error_code ignored;
  fs::remove(temp_file, ignored);

  if (result.audio != audio) throw DecodeError("self-test audio mismatch");
  if (result.meta_json != meta_json) throw DecodeError("self-test metadata mismatch");
  if (result.cover != cover) throw DecodeError("self-test cover mismatch");
  if (result.format != "mp3") throw DecodeError("self-test format mismatch");

  std::cout << "ncmdecode self-test passed\n";
  return 0;
}

int run(int argc, char** argv) {
  fs::path input;
  fs::path out_dir;

  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg == "--help" || arg == "-h") {
      print_usage();
      return 0;
    }
    if (arg == "--self-test") {
      return run_self_test();
    }
    if (arg == "--input" && i + 1 < argc) {
      input = fs::path(argv[++i]);
      continue;
    }
    if (arg == "--out-dir" && i + 1 < argc) {
      out_dir = fs::path(argv[++i]);
      continue;
    }
    throw DecodeError("unknown or incomplete argument: " + arg);
  }

  if (input.empty() || out_dir.empty()) {
    print_usage();
    return 2;
  }

  const auto result = decode_ncm(input);
  fs::create_directories(out_dir);

  write_file(out_dir / ("audio." + result.format), result.audio);
  write_text_file(out_dir / "meta.json", result.meta_json.empty() ? "{}" : result.meta_json);
  if (!result.cover.empty()) {
    write_file(out_dir / ("cover" + cover_extension(result.cover)), result.cover);
  }

  std::cout << "decoded " << input.filename().string() << " -> audio." << result.format << "\n";
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  try {
    return run(argc, argv);
  } catch (const std::exception& error) {
    std::cerr << "ncmdecode: " << error.what() << "\n";
    return 1;
  }
}
