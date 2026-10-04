# This file makes the 'services' directory a Python package
# and centralizes the DataService instance.

from .data_service import DataService

# Create a single, shared instance that the rest of the app can import
data_service = DataService()
from .season_service import SeasonService
season_service = SeasonService()
