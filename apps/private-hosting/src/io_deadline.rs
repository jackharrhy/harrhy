use socket2::{SockAddr, Socket, Type};
use std::{
    io::{self, BufRead, BufReader, Read, Write},
    os::unix::net::UnixStream,
    path::Path,
    time::{Duration, Instant},
};

pub struct DeadlineStream {
    socket: Socket,
    deadline: Instant,
}

impl DeadlineStream {
    pub fn accepted(socket: UnixStream, timeout: Duration) -> Self {
        Self {
            socket: std::os::fd::OwnedFd::from(socket).into(),
            deadline: Instant::now() + timeout,
        }
    }

    pub fn unix(path: &Path, timeout: Duration) -> io::Result<Self> {
        Self::connect(&SockAddr::unix(path)?, timeout)
    }

    pub fn connect(addr: &SockAddr, timeout: Duration) -> io::Result<Self> {
        let stream = Self {
            socket: Socket::new(addr.domain(), Type::STREAM, None)?,
            deadline: Instant::now() + timeout,
        };
        stream.socket.connect_timeout(addr, stream.remaining()?)?;
        Ok(stream)
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.deadline = Instant::now() + timeout;
        self
    }

    fn remaining(&self) -> io::Result<Duration> {
        self.deadline
            .checked_duration_since(Instant::now())
            .filter(|d| !d.is_zero())
            .ok_or_else(|| io::Error::new(io::ErrorKind::TimedOut, "I/O deadline expired"))
    }

    pub fn line(&mut self, max: u64) -> io::Result<String> {
        let mut line = String::new();
        BufReader::new(self.take(max)).read_line(&mut line)?;
        if !line.ends_with('\n') {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "incomplete or oversized line",
            ));
        }
        Ok(line)
    }
}

impl Read for DeadlineStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.socket.set_read_timeout(Some(self.remaining()?))?;
        self.socket.read(buf)
    }
}

impl Write for DeadlineStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.socket.set_write_timeout(Some(self.remaining()?))?;
        self.socket.write(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
