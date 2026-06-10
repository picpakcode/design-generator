-- Enable realtime for the projects table so clients can subscribe to cross-session changes
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
