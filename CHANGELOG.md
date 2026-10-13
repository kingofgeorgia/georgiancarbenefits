# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added
- Precise personal-use import calculation path for 2026 scenarios.
- Horsepower and powertrain-aware recycling fee calculation.
- EV support with zero engine displacement.
- Regression tests for customs and recycling boundaries.
- GitHub Actions CI for backend and frontend.
- Frontend typecheck script.

### Changed
- Public calculator no longer requires authentication.
- Calculator UI now collects horsepower and powertrain type.
- Results now display customs processing fee and total customs cost.
- Repository documentation repositioned as MileON Import Calculator.

### Planned
- Exact manufacture-date age calculation.
- Versioned tariff data files outside Python code.
- Official exchange-rate provider with source timestamps.
- Production-specific Docker configuration.
