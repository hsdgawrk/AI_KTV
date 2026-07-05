cmake_minimum_required(VERSION 3.20)

project(ncmdecode LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "ncmdecode is a Windows-only tool because it uses Windows CNG for AES.")
endif()

add_executable(ncmdecode src/main.cpp)
target_compile_features(ncmdecode PRIVATE cxx_std_17)
if(MSVC)
  target_compile_options(ncmdecode PRIVATE /EHsc)
endif()
target_link_libraries(ncmdecode PRIVATE bcrypt)

enable_testing()
add_test(NAME ncmdecode_usage COMMAND ncmdecode --help)
add_test(NAME ncmdecode_self_test COMMAND ncmdecode --self-test)
